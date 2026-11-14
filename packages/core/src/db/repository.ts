// The data layer shared by the desktop and mobile apps: CRUD, summaries and backup
// import/export over a SqlDriver, on the v2+ schema (see migrations.ts).
//
// Sync model:
// - every write stamps `updated_at` (HLC) and `device_id`
// - rows are never deleted: `deleted_at` marks a tombstone, and every read filters on it
// - deleting a parent tombstones its children the way the old ON DELETE rules did

import { encodeBackup } from "../backup/format.ts";
import { intervalOverrideId } from "../ids/uuid.ts";
import { builtinServiceTypeId, findBuiltinServiceTypeByName } from "../service-types/builtin.ts";
import { vehicleIdentityKey } from "../vehicles/identity.ts";
import {
  normaliseVin,
  validateIntervalOverride,
  validateMaintenanceLog,
  validateOdometerReading,
  validatePreference,
  validateServiceEvent,
  validateServiceType,
  validateVehicle,
} from "../validation.ts";
import { DEFAULT_PREFERENCES } from "../units.ts";
import { seedBuiltinServiceTypes } from "./seed.ts";
import { transaction } from "./transaction.ts";
import type { SqlDriver, SqlValue, WriteContext } from "./driver";
import type {
  BackupAnalysisResponse,
  BackupConfiguration,
  CustomFieldCreate,
  CustomFieldRead,
  CustomFieldValueCreate,
  CustomFieldValueRead,
  FullBackupData,
  Id,
  MaintenanceLogCreate,
  MaintenanceLogRead,
  MaintenanceLogUpdate,
  MaintenanceSummary,
  OdometerReadingCreate,
  OdometerReadingRead,
  OdometerReadingUpdate,
  Preferences,
  RestorePlan,
  ServiceEventCreate,
  ServiceEventRead,
  ServiceEventUpdate,
  ServiceItemCreate,
  ServiceTypeCreate,
  ServiceTypeLogSummary,
  ServiceTypeRead,
  ServiceTypeUpdate,
  VehicleCreate,
  VehicleRead,
  VehicleServiceIntervalOverrideCreate,
  VehicleServiceIntervalOverrideRead,
  VehicleUpdate,
} from "../types";

type Row = Record<string, any>;
type LinkTable = "service_type_resets" | "service_type_suggestions";
type LinkColumn = "reset_id" | "suggestion_id";

export type Repository = ReturnType<typeof createRepository>;

export function createRepository(db: SqlDriver, w: WriteContext) {
  const all = <T = Row>(sql: string, params: SqlValue[] = []) => db.all<T>(sql, params);
  const first = async <T = Row>(sql: string, params: SqlValue[] = []) => (await db.all<T>(sql, params))[0] ?? null;
  const run = (sql: string, params: SqlValue[] = []) => db.run(sql, params);
  const tx = <T>(fn: () => Promise<T>) => transaction(db, fn);

  /** `SET` fragment and values marking a row as written now. */
  const touched = (): [string, SqlValue[]] => ["updated_at = ?, device_id = ?", [w.stamp(), w.deviceId]];
  /** `SET` fragment and values tombstoning a row now. */
  const tombstoned = (): [string, SqlValue[]] => {
    const stamp = w.stamp();
    return ["deleted_at = ?, updated_at = ?, device_id = ?", [stamp, stamp, w.deviceId]];
  };
  /** Trimmed, or null when empty. */
  const cleanText = (text: string | null | undefined) => (text && text.trim() ? text.trim() : null);
  const cleanUnit = cleanText;

  // ==================================================================
  // Hydration
  // ==================================================================

  async function getFields(serviceTypeId: Id, includeArchived: boolean): Promise<CustomFieldRead[]> {
    const rows = await all(
      `SELECT id, name, field_type, unit, archived_at FROM custom_fields
       WHERE service_type_id = ? AND deleted_at IS NULL ${includeArchived ? "" : "AND archived_at IS NULL"}
       ORDER BY archived_at IS NOT NULL, sort_order ASC, name ASC`,
      [serviceTypeId],
    );
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      field_type: r.field_type,
      unit: r.unit,
      ...(r.archived_at ? { archived: true } : {}),
    }));
  }

  async function buildServiceType(row: Row, includeArchivedFields: boolean): Promise<ServiceTypeRead> {
    const resets = await all<{ id: Id }>(
      `SELECT r.reset_id AS id FROM service_type_resets r
       JOIN service_types c ON c.id = r.reset_id AND c.deleted_at IS NULL
       WHERE r.parent_id = ? AND r.deleted_at IS NULL`,
      [row.id],
    );
    const suggestions = await all<{ id: Id }>(
      `SELECT s.suggestion_id AS id FROM service_type_suggestions s
       JOIN service_types c ON c.id = s.suggestion_id AND c.deleted_at IS NULL
       WHERE s.parent_id = ? AND s.deleted_at IS NULL`,
      [row.id],
    );
    return {
      id: row.id,
      slug: row.slug ?? null,
      name: row.name,
      recommended_interval_km: row.recommended_interval_km,
      recommended_interval_days: row.recommended_interval_days,
      fields: await getFields(row.id, includeArchivedFields),
      resets: resets.map((r) => r.id),
      suggestions: suggestions.map((s) => s.id),
    };
  }

  async function buildLog(row: Row): Promise<MaintenanceLogRead> {
    const stRow = row.service_type_id
      ? await first("SELECT * FROM service_types WHERE id = ? AND deleted_at IS NULL", [row.service_type_id])
      : null;
    const cfvRows = await all(
      `SELECT cfv.id, cfv.field_id, cfv.value, cf.name AS cf_name, cf.field_type AS cf_field_type,
              cf.unit AS cf_unit, cf.archived_at AS cf_archived_at
       FROM custom_field_values cfv
       JOIN custom_fields cf ON cfv.field_id = cf.id
       WHERE cfv.log_id = ? AND cfv.deleted_at IS NULL
       ORDER BY cf.sort_order, cf.name`,
      [row.id],
    );
    const values: CustomFieldValueRead[] = cfvRows.map((cfv) => ({
      id: cfv.id,
      field_id: cfv.field_id,
      value: cfv.value,
      custom_field: {
        id: cfv.field_id,
        name: cfv.cf_name,
        field_type: cfv.cf_field_type,
        unit: cfv.cf_unit,
        ...(cfv.cf_archived_at ? { archived: true } : {}),
      },
    }));
    return {
      id: row.id,
      vehicle_id: row.vehicle_id,
      event_id: row.event_id ?? null,
      service_type_id: row.service_type_id,
      date: row.date,
      mileage: row.mileage,
      cost_cents: row.cost_cents,
      notes: row.notes,
      service_type: stRow ? await buildServiceType(stRow, false) : null,
      custom_field_values: values,
    };
  }

  async function listLogs(vehicleId: Id, serviceTypeId?: Id): Promise<MaintenanceLogRead[]> {
    let sql = "SELECT * FROM maintenance_logs WHERE vehicle_id = ? AND deleted_at IS NULL";
    const params: SqlValue[] = [vehicleId];
    if (serviceTypeId !== undefined) {
      sql += " AND service_type_id = ?";
      params.push(serviceTypeId);
    }
    sql += " ORDER BY date DESC, id DESC";
    const logs: MaintenanceLogRead[] = [];
    for (const row of await all(sql, params)) logs.push(await buildLog(row));
    return logs;
  }

  async function buildEvent(row: Row): Promise<ServiceEventRead> {
    const items: MaintenanceLogRead[] = [];
    // UUIDv7 ids: items in the order they were added.
    for (const log of await all("SELECT * FROM maintenance_logs WHERE event_id = ? AND deleted_at IS NULL ORDER BY id", [row.id])) {
      items.push(await buildLog(log));
    }
    return {
      id: row.id,
      vehicle_id: row.vehicle_id,
      date: row.date,
      mileage: row.mileage,
      shop: row.shop ?? null,
      notes: row.notes ?? null,
      total_cost_cents: items.reduce((sum, item) => sum + item.cost_cents, 0),
      items,
    };
  }

  /** A vehicle's visits, newest first: its service events, and each log outside one as a visit of its own. */
  async function listVisits(vehicleId: Id): Promise<ServiceEventRead[]> {
    const visits: ServiceEventRead[] = [];
    for (const row of await all("SELECT * FROM service_events WHERE vehicle_id = ? AND deleted_at IS NULL", [vehicleId])) {
      visits.push(await buildEvent(row));
    }
    const standalone = await all(
      `SELECT * FROM maintenance_logs WHERE vehicle_id = ? AND deleted_at IS NULL
         AND (event_id IS NULL OR event_id NOT IN (SELECT id FROM service_events WHERE deleted_at IS NULL))`,
      [vehicleId],
    );
    for (const row of standalone) {
      const log = await buildLog(row);
      visits.push({
        id: log.id,
        vehicle_id: log.vehicle_id,
        date: log.date,
        mileage: log.mileage,
        shop: null,
        notes: null,
        total_cost_cents: log.cost_cents,
        items: [log],
        standalone: true,
      });
    }
    const desc = (a: string, b: string) => (a < b ? 1 : a > b ? -1 : 0);
    return visits.sort((a, b) => desc(a.date, b.date) || desc(a.id, b.id));
  }

  async function listOverrides(vehicleId: Id): Promise<VehicleServiceIntervalOverrideRead[]> {
    return all<VehicleServiceIntervalOverrideRead>(
      `SELECT id, vehicle_id, service_type_id, override_interval_km, override_interval_days
       FROM vehicle_service_interval_overrides WHERE vehicle_id = ? AND deleted_at IS NULL`,
      [vehicleId],
    );
  }

  /** Newest first: by date, then the higher mileage. */
  async function listReadings(vehicleId: Id): Promise<OdometerReadingRead[]> {
    return all<OdometerReadingRead>(
      `SELECT id, vehicle_id, date, mileage, note FROM odometer_readings
       WHERE vehicle_id = ? AND deleted_at IS NULL ORDER BY date DESC, mileage DESC, id DESC`,
      [vehicleId],
    );
  }

  async function getReading(id: Id): Promise<OdometerReadingRead | null> {
    return first<OdometerReadingRead>(
      "SELECT id, vehicle_id, date, mileage, note FROM odometer_readings WHERE id = ? AND deleted_at IS NULL",
      [id],
    );
  }

  async function buildVehicle(row: Row): Promise<VehicleRead> {
    const maintenance_logs = await listLogs(row.id);
    const odometer_readings = await listReadings(row.id);
    const known = [
      ...(row.initial_mileage != null ? [row.initial_mileage as number] : []),
      ...maintenance_logs.map((l) => l.mileage),
      ...odometer_readings.map((r) => r.mileage),
    ];
    return {
      id: row.id,
      make: row.make,
      model: row.model,
      year: row.year,
      vin: row.vin,
      initial_mileage: row.initial_mileage,
      acquisition_date: row.acquisition_date,
      maintenance_logs,
      interval_overrides: await listOverrides(row.id),
      odometer_readings,
      current_mileage: known.length ? Math.max(...known) : null,
    };
  }

  async function listServiceTypes(includeArchivedFields: boolean): Promise<ServiceTypeRead[]> {
    const types: ServiceTypeRead[] = [];
    for (const row of await all("SELECT * FROM service_types WHERE deleted_at IS NULL ORDER BY name ASC")) {
      types.push(await buildServiceType(row, includeArchivedFields));
    }
    return types;
  }

  // ==================================================================
  // Writes (no transaction of their own; callers wrap them)
  // ==================================================================

  async function insertVehicle(data: VehicleCreate): Promise<Id> {
    const id = w.newId();
    await run(
      `INSERT INTO vehicles (id, make, model, year, vin, initial_mileage, acquisition_date, updated_at, deleted_at, device_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      [id, data.make, data.model, data.year ?? null, normaliseVin(data.vin), data.initial_mileage ?? null,
        data.acquisition_date ?? null, w.stamp(), w.deviceId],
    );
    return id;
  }

  async function tombstoneVehicle(id: Id): Promise<void> {
    const [del, delVals] = tombstoned();
    await run(
      `UPDATE custom_field_values SET ${del} WHERE deleted_at IS NULL
         AND log_id IN (SELECT id FROM maintenance_logs WHERE vehicle_id = ?)`,
      [...delVals, id],
    );
    await run(`UPDATE maintenance_logs SET ${del} WHERE deleted_at IS NULL AND vehicle_id = ?`, [...delVals, id]);
    await run(`UPDATE service_events SET ${del} WHERE deleted_at IS NULL AND vehicle_id = ?`, [...delVals, id]);
    await run(`UPDATE vehicle_service_interval_overrides SET ${del} WHERE deleted_at IS NULL AND vehicle_id = ?`, [...delVals, id]);
    await run(`UPDATE odometer_readings SET ${del} WHERE deleted_at IS NULL AND vehicle_id = ?`, [...delVals, id]);
    await run(`UPDATE vehicles SET ${del} WHERE deleted_at IS NULL AND id = ?`, [...delVals, id]);
  }

  async function insertServiceType(id: Id, slug: string | null, name: string, km: number | null, days: number | null) {
    await run(
      `INSERT INTO service_types (id, slug, name, recommended_interval_km, recommended_interval_days, updated_at, deleted_at, device_id)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      [id, slug, name, km, days, w.stamp(), w.deviceId],
    );
  }

  async function insertField(
    serviceTypeId: Id,
    field: { name: string; field_type: CustomFieldCreate["field_type"]; unit?: string | null },
    sortOrder: number,
    archived: boolean,
  ): Promise<Id> {
    const id = w.newId();
    const stamp = w.stamp();
    await run(
      `INSERT INTO custom_fields (id, service_type_id, name, field_type, unit, required, sort_order, default_value,
                                  archived_at, updated_at, deleted_at, device_id)
       VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?, ?, NULL, ?)`,
      [id, serviceTypeId, field.name, field.field_type, cleanUnit(field.unit), sortOrder, archived ? stamp : null, stamp, w.deviceId],
    );
    return id;
  }

  /**
   * Makes `incoming` the service type's active field list. Existing fields are matched by id,
   * then by name, and updated in place. Fields left out, or whose type changed, are archived
   * (never deleted) so values already recorded with them keep their definition.
   */
  async function syncFields(serviceTypeId: Id, incoming: CustomFieldCreate[]): Promise<void> {
    const existing = await all<{ id: Id; name: string; field_type: string; unit: string | null; sort_order: number }>(
      `SELECT id, name, field_type, unit, sort_order FROM custom_fields
       WHERE service_type_id = ? AND archived_at IS NULL AND deleted_at IS NULL`,
      [serviceTypeId],
    );
    const claimed = new Set<Id>();
    const matches = incoming.map((field) => {
      const match =
        (field.id ? existing.find((e) => e.id === field.id && !claimed.has(e.id)) : undefined) ??
        existing.find((e) => e.name === field.name && !claimed.has(e.id));
      if (match && match.field_type === field.field_type) {
        claimed.add(match.id);
        return match;
      }
      return undefined; // a new field, or a type change: old values stay with the archived field
    });

    // Archive first so the names they free can be reused below.
    for (const e of existing) {
      if (claimed.has(e.id)) continue;
      const stamp = w.stamp();
      await run("UPDATE custom_fields SET archived_at = ?, updated_at = ?, device_id = ? WHERE id = ?", [stamp, stamp, w.deviceId, e.id]);
    }

    for (const [index, field] of incoming.entries()) {
      const match = matches[index];
      const unit = cleanUnit(field.unit);
      if (!match) {
        await insertField(serviceTypeId, field, index, false);
      } else if (match.name !== field.name || match.unit !== unit || match.sort_order !== index) {
        const [touch, touchVals] = touched();
        await run(`UPDATE custom_fields SET name = ?, unit = ?, sort_order = ?, ${touch} WHERE id = ?`, [
          field.name, unit, index, ...touchVals, match.id,
        ]);
      }
    }
  }

  /** Makes `childIds` the parent's live links in a reset/suggestion join table. */
  async function setLinks(table: LinkTable, column: LinkColumn, parentId: Id, childIds: Id[]): Promise<void> {
    const wanted = new Set(childIds);
    const live = await all<{ child: Id }>(
      `SELECT ${column} AS child FROM ${table} WHERE parent_id = ? AND deleted_at IS NULL`,
      [parentId],
    );
    for (const { child } of live) {
      if (wanted.has(child)) continue;
      const [del, delVals] = tombstoned();
      await run(`UPDATE ${table} SET ${del} WHERE parent_id = ? AND ${column} = ?`, [...delVals, parentId, child]);
    }
    const liveSet = new Set(live.map((l) => l.child));
    for (const child of wanted) {
      if (liveSet.has(child)) continue;
      await run(
        `INSERT INTO ${table} (parent_id, ${column}, updated_at, deleted_at, device_id) VALUES (?, ?, ?, NULL, ?)
         ON CONFLICT(parent_id, ${column}) DO UPDATE SET deleted_at = NULL, updated_at = excluded.updated_at,
           device_id = excluded.device_id`,
        [parentId, child, w.stamp(), w.deviceId],
      );
    }
  }

  async function insertFieldValue(logId: Id, cfv: CustomFieldValueCreate): Promise<void> {
    await run(
      `INSERT INTO custom_field_values (id, log_id, field_id, value, updated_at, deleted_at, device_id)
       VALUES (?, ?, ?, ?, ?, NULL, ?)`,
      [w.newId(), logId, cfv.field_id, cfv.value, w.stamp(), w.deviceId],
    );
  }

  async function insertLog(vehicleId: Id, data: MaintenanceLogCreate, eventId: Id | null = null): Promise<Id> {
    const id = w.newId();
    await run(
      `INSERT INTO maintenance_logs (id, vehicle_id, event_id, service_type_id, date, mileage, cost_cents, notes,
                                     updated_at, deleted_at, device_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      [id, vehicleId, eventId, data.service_type_id ?? null, data.date, data.mileage, data.cost_cents, data.notes ?? null,
        w.stamp(), w.deviceId],
    );
    for (const cfv of data.custom_field_values ?? []) await insertFieldValue(id, cfv);
    return id;
  }

  async function tombstoneLog(logId: Id): Promise<void> {
    const [del, delVals] = tombstoned();
    await run(`UPDATE custom_field_values SET ${del} WHERE deleted_at IS NULL AND log_id = ?`, [...delVals, logId]);
    await run(`UPDATE maintenance_logs SET ${del} WHERE deleted_at IS NULL AND id = ?`, [...delVals, logId]);
  }

  async function insertEvent(
    vehicleId: Id,
    header: { date: string; mileage: number; shop?: string | null; notes?: string | null },
  ): Promise<Id> {
    const id = w.newId();
    await run(
      `INSERT INTO service_events (id, vehicle_id, date, mileage, shop, notes, updated_at, deleted_at, device_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?)`,
      [id, vehicleId, header.date, header.mileage, cleanText(header.shop), cleanText(header.notes), w.stamp(), w.deviceId],
    );
    return id;
  }

  /** Writes an existing item's columns that changed (date and mileage come from its visit). */
  async function updateItem(log: Row, changes: Record<string, SqlValue | undefined>) {
    const changed = Object.entries(changes).filter(([column, value]) => value !== undefined && log[column] !== value);
    if (changed.length === 0) return;
    const [touch, touchVals] = touched();
    await run(`UPDATE maintenance_logs SET ${changed.map(([column]) => `${column} = ?`).join(", ")}, ${touch} WHERE id = ?`, [
      ...changed.map(([, value]) => value as SqlValue), ...touchVals, log.id,
    ]);
  }

  /** Makes `items` the visit's live items: matched by id and updated, added, or deleted when left out. */
  async function syncItems(event: Row, date: string, mileage: number, items: (ServiceItemCreate & { id?: Id })[]): Promise<void> {
    const live = await all("SELECT * FROM maintenance_logs WHERE event_id = ? AND deleted_at IS NULL", [event.id]);
    const claimed = new Set<Id>();
    const matches = items.map((item) => {
      const match = item.id ? live.find((l) => l.id === item.id && !claimed.has(l.id)) : undefined;
      if (match) claimed.add(match.id);
      return match;
    });
    for (const log of live) if (!claimed.has(log.id)) await tombstoneLog(log.id);
    for (const [index, item] of items.entries()) {
      const match = matches[index];
      if (!match) {
        await insertLog(event.vehicle_id, { ...item, date, mileage }, event.id);
        continue;
      }
      await updateItem(match, {
        date,
        mileage,
        cost_cents: item.cost_cents,
        notes: item.notes ?? null,
        service_type_id: item.service_type_id ?? null,
      });
      if (item.custom_field_values !== undefined) await syncFieldValues(match.id, item.custom_field_values);
    }
  }

  /**
   * Applies the values of the log's current fields. A current field left out is cleared;
   * values recorded against archived fields are kept, since forms can't show them.
   */
  async function syncFieldValues(logId: Id, incoming: CustomFieldValueCreate[]): Promise<void> {
    const wanted = new Map(incoming.map((v) => [v.field_id, v.value]));
    const existing = await all<{ id: Id; field_id: Id; value: string; archived: number }>(
      `SELECT c.id, c.field_id, c.value, (f.archived_at IS NOT NULL OR f.deleted_at IS NOT NULL) AS archived
       FROM custom_field_values c JOIN custom_fields f ON f.id = c.field_id
       WHERE c.log_id = ? AND c.deleted_at IS NULL ORDER BY c.id`,
      [logId],
    );
    const kept = new Set<Id>();
    for (const e of existing) {
      if (wanted.has(e.field_id) && !kept.has(e.field_id)) {
        kept.add(e.field_id);
        const value = wanted.get(e.field_id)!;
        if (value !== e.value) {
          const [touch, touchVals] = touched();
          await run(`UPDATE custom_field_values SET value = ?, ${touch} WHERE id = ?`, [value, ...touchVals, e.id]);
        }
      } else if (wanted.has(e.field_id) || !e.archived) {
        const [del, delVals] = tombstoned();
        await run(`UPDATE custom_field_values SET ${del} WHERE id = ?`, [...delVals, e.id]);
      }
    }
    for (const v of incoming) {
      if (kept.has(v.field_id)) continue;
      kept.add(v.field_id);
      await insertFieldValue(logId, v);
    }
  }

  const cleanNote = (note: string | null | undefined) => (note && note.trim() ? note.trim() : null);

  async function insertReading(vehicleId: Id, data: OdometerReadingCreate): Promise<Id> {
    const id = w.newId();
    await run(
      `INSERT INTO odometer_readings (id, vehicle_id, date, mileage, note, updated_at, deleted_at, device_id)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      [id, vehicleId, data.date, data.mileage, cleanNote(data.note), w.stamp(), w.deviceId],
    );
    return id;
  }

  /** One override row per vehicle and service type, with the same id on every device. */
  async function writeOverride(vehicleId: Id, serviceTypeId: Id, data: VehicleServiceIntervalOverrideCreate): Promise<void> {
    await run(
      `INSERT INTO vehicle_service_interval_overrides (id, vehicle_id, service_type_id, override_interval_km,
                                                       override_interval_days, updated_at, deleted_at, device_id)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
       ON CONFLICT(vehicle_id, service_type_id) DO UPDATE SET
         override_interval_km = excluded.override_interval_km,
         override_interval_days = excluded.override_interval_days,
         deleted_at = NULL,
         updated_at = excluded.updated_at,
         device_id = excluded.device_id`,
      [intervalOverrideId(vehicleId, serviceTypeId), vehicleId, serviceTypeId,
        data.override_interval_km ?? null, data.override_interval_days ?? null, w.stamp(), w.deviceId],
    );
  }

  /**
   * The local service type for a backup one: the live one with the same name, else the
   * built-in it names (restored if it was deleted), else a new custom one.
   */
  async function resolveImportedServiceType(st: FullBackupData["service_types"][number]): Promise<Id> {
    const existing = await first<{ id: Id }>("SELECT id FROM service_types WHERE name = ? AND deleted_at IS NULL", [st.name]);
    if (existing) return existing.id;

    const builtin = findBuiltinServiceTypeByName(st.name);
    if (builtin) {
      const id = builtinServiceTypeId(builtin.slug);
      if (await first("SELECT id FROM service_types WHERE id = ?", [id])) {
        await run(
          `UPDATE service_types SET name = ?, recommended_interval_km = ?, recommended_interval_days = ?,
             deleted_at = NULL, updated_at = ?, device_id = ? WHERE id = ?`,
          [st.name, st.recommended_interval_km, st.recommended_interval_days, w.stamp(), w.deviceId, id],
        );
      } else {
        await insertServiceType(id, builtin.slug, st.name, st.recommended_interval_km, st.recommended_interval_days);
      }
      return id;
    }

    const id = w.newId();
    await insertServiceType(id, null, st.name, st.recommended_interval_km, st.recommended_interval_days);
    return id;
  }

  async function importBackupInTransaction(backup: FullBackupData, plan: RestorePlan): Promise<void> {
    // Replacements: delete the local vehicle first; the backup copy is added below.
    const vinsToReplace = new Set(plan.conflict_resolutions.filter((r) => r.action === "replace").map((r) => r.vin));
    for (const vin of vinsToReplace) {
      for (const { id } of await all<{ id: Id }>("SELECT id FROM vehicles WHERE vin = ? AND deleted_at IS NULL", [vin])) {
        await tombstoneVehicle(id);
      }
    }

    const toAdd = new Set(plan.vehicles_to_add);
    const vehiclesToCreate = backup.vehicles.filter((v) => toAdd.has(v.id) || (v.vin && vinsToReplace.has(v.vin)));
    if (vehiclesToCreate.length === 0 && backup.service_types.length === 0) return;

    // File ids → local ids. Service types and fields are matched by name.
    const serviceTypeIds = new Map<number, Id>();
    const fieldIds = new Map<number, Id>();
    for (const st of backup.service_types) {
      const stId = await resolveImportedServiceType(st);
      serviceTypeIds.set(st.id, stId);
      for (const [index, field] of st.fields.entries()) {
        const existing = await first<{ id: Id }>(
          field.archived
            ? `SELECT id FROM custom_fields WHERE service_type_id = ? AND name = ? AND field_type = ?
                 AND archived_at IS NOT NULL AND deleted_at IS NULL`
            : `SELECT id FROM custom_fields WHERE service_type_id = ? AND name = ? AND archived_at IS NULL AND deleted_at IS NULL`,
          field.archived ? [stId, field.name, field.field_type] : [stId, field.name],
        );
        fieldIds.set(field.id, existing?.id ?? (await insertField(stId, field, index, !!field.archived)));
      }
    }

    // Links are only added: links removed locally stay removed.
    for (const st of backup.service_types) {
      const parentId = serviceTypeIds.get(st.id)!;
      for (const [table, column, children] of [
        ["service_type_resets", "reset_id", st.resets],
        ["service_type_suggestions", "suggestion_id", st.suggestions],
      ] as const) {
        for (const child of children) {
          const childId = serviceTypeIds.get(child);
          if (!childId) continue;
          await run(
            `INSERT INTO ${table} (parent_id, ${column}, updated_at, deleted_at, device_id) VALUES (?, ?, ?, NULL, ?)
             ON CONFLICT(parent_id, ${column}) DO NOTHING`,
            [parentId, childId, w.stamp(), w.deviceId],
          );
        }
      }
    }

    for (const v of vehiclesToCreate) {
      const vehicleId = await insertVehicle(v);
      const eventIds = new Map<number, Id>();
      for (const ev of v.service_events ?? []) {
        eventIds.set(ev.id, await insertEvent(vehicleId, { ...ev, date: ev.date || new Date().toISOString().slice(0, 10) }));
      }
      // Files list logs newest first; insert oldest first so the new ids keep their order
      // (and a visit's items theirs).
      for (const log of [...v.maintenance_logs].reverse()) {
        await insertLog(vehicleId, {
          date: log.date || new Date().toISOString().slice(0, 10),
          mileage: log.mileage,
          cost_cents: Math.round(log.cost * 100),
          notes: log.notes,
          service_type_id: log.service_type_id != null ? (serviceTypeIds.get(log.service_type_id) ?? null) : null,
          custom_field_values: log.custom_field_values.flatMap((cfv) => {
            const fieldId = fieldIds.get(cfv.field_id);
            return fieldId ? [{ field_id: fieldId, value: cfv.value }] : [];
          }),
        }, log.event_id != null ? (eventIds.get(log.event_id) ?? null) : null);
      }
      for (const ov of v.interval_overrides) {
        const serviceTypeId = serviceTypeIds.get(ov.service_type_id);
        if (serviceTypeId) await writeOverride(vehicleId, serviceTypeId, ov);
      }
      for (const reading of v.odometer_readings) {
        await insertReading(vehicleId, reading);
      }
    }
  }

  // ==================================================================
  // Public API
  // ==================================================================

  const repo = {
    // --- Vehicles ---
    async getAllVehicles(): Promise<VehicleRead[]> {
      const vehicles: VehicleRead[] = [];
      // UUIDv7 ids sort by creation time, so this keeps "newest first".
      for (const row of await all("SELECT * FROM vehicles WHERE deleted_at IS NULL ORDER BY id DESC")) {
        vehicles.push(await buildVehicle(row));
      }
      return vehicles;
    },

    async getVehicleById(id: Id): Promise<VehicleRead | null> {
      const row = await first("SELECT * FROM vehicles WHERE id = ? AND deleted_at IS NULL", [id]);
      return row ? buildVehicle(row) : null;
    },

    async createVehicle(data: VehicleCreate): Promise<VehicleRead> {
      validateVehicle(data);
      const id = await tx(() => insertVehicle(data));
      return (await repo.getVehicleById(id))!;
    },

    async updateVehicle(id: Id, data: VehicleUpdate): Promise<VehicleRead> {
      validateVehicle(data, true);
      const sets: string[] = [];
      const vals: SqlValue[] = [];
      if (data.make !== undefined) { sets.push("make = ?"); vals.push(data.make); }
      if (data.model !== undefined) { sets.push("model = ?"); vals.push(data.model); }
      if (data.year !== undefined) { sets.push("year = ?"); vals.push(data.year); }
      if (data.vin !== undefined) { sets.push("vin = ?"); vals.push(normaliseVin(data.vin)); }
      if (data.initial_mileage !== undefined) { sets.push("initial_mileage = ?"); vals.push(data.initial_mileage); }
      if (data.acquisition_date !== undefined) { sets.push("acquisition_date = ?"); vals.push(data.acquisition_date); }
      if (sets.length > 0) {
        const [touch, touchVals] = touched();
        await run(`UPDATE vehicles SET ${sets.join(", ")}, ${touch} WHERE id = ? AND deleted_at IS NULL`, [...vals, ...touchVals, id]);
      }
      return (await repo.getVehicleById(id))!;
    },

    /** Deletes a vehicle with its visits, logs, odometer readings and interval overrides. */
    deleteVehicle: (id: Id): Promise<void> => tx(() => tombstoneVehicle(id)),

    /** Deletes every vehicle with its logs and overrides. Service types are kept. */
    deleteAllVehicles: (): Promise<void> =>
      tx(async () => {
        for (const { id } of await all<{ id: Id }>("SELECT id FROM vehicles WHERE deleted_at IS NULL")) {
          await tombstoneVehicle(id);
        }
      }),

    // --- Service types ---
    getAllServiceTypes: (): Promise<ServiceTypeRead[]> => listServiceTypes(false),

    async getServiceTypeById(id: Id): Promise<ServiceTypeRead | null> {
      const row = await first("SELECT * FROM service_types WHERE id = ? AND deleted_at IS NULL", [id]);
      return row ? buildServiceType(row, false) : null;
    },

    async createServiceType(data: ServiceTypeCreate): Promise<ServiceTypeRead> {
      validateServiceType(data);
      const id = w.newId();
      await tx(async () => {
        await insertServiceType(id, null, data.name, data.recommended_interval_km ?? null, data.recommended_interval_days ?? null);
        await syncFields(id, data.fields);
        await setLinks("service_type_resets", "reset_id", id, data.resets ?? []);
        await setLinks("service_type_suggestions", "suggestion_id", id, data.suggestions ?? []);
      });
      return (await repo.getServiceTypeById(id))!;
    },

    async updateServiceType(id: Id, data: ServiceTypeUpdate): Promise<ServiceTypeRead> {
      validateServiceType(data, true);
      await tx(async () => {
        const sets: string[] = [];
        const vals: SqlValue[] = [];
        if (data.name !== undefined) { sets.push("name = ?"); vals.push(data.name); }
        if (data.recommended_interval_km !== undefined) { sets.push("recommended_interval_km = ?"); vals.push(data.recommended_interval_km); }
        if (data.recommended_interval_days !== undefined) { sets.push("recommended_interval_days = ?"); vals.push(data.recommended_interval_days); }
        if (sets.length > 0) {
          const [touch, touchVals] = touched();
          await run(`UPDATE service_types SET ${sets.join(", ")}, ${touch} WHERE id = ? AND deleted_at IS NULL`, [...vals, ...touchVals, id]);
        }
        if (data.fields !== undefined) await syncFields(id, data.fields);
        if (data.resets !== undefined) await setLinks("service_type_resets", "reset_id", id, data.resets);
        if (data.suggestions !== undefined) await setLinks("service_type_suggestions", "suggestion_id", id, data.suggestions);
      });
      return (await repo.getServiceTypeById(id))!;
    },

    /**
     * Deletes a service type with its fields, their values, its links and its overrides.
     * Its logs are kept with `service_type_id` cleared (what ON DELETE SET NULL used to do).
     */
    deleteServiceType: (id: Id): Promise<void> =>
      tx(async () => {
        const [del, delVals] = tombstoned();
        await run(
          `UPDATE custom_field_values SET ${del} WHERE deleted_at IS NULL
             AND field_id IN (SELECT id FROM custom_fields WHERE service_type_id = ?)`,
          [...delVals, id],
        );
        await run(`UPDATE custom_fields SET ${del} WHERE deleted_at IS NULL AND service_type_id = ?`, [...delVals, id]);
        await run(`UPDATE service_type_resets SET ${del} WHERE deleted_at IS NULL AND (parent_id = ? OR reset_id = ?)`, [...delVals, id, id]);
        await run(
          `UPDATE service_type_suggestions SET ${del} WHERE deleted_at IS NULL AND (parent_id = ? OR suggestion_id = ?)`,
          [...delVals, id, id],
        );
        await run(`UPDATE vehicle_service_interval_overrides SET ${del} WHERE deleted_at IS NULL AND service_type_id = ?`, [...delVals, id]);
        const [touch, touchVals] = touched();
        await run(`UPDATE maintenance_logs SET service_type_id = NULL, ${touch} WHERE deleted_at IS NULL AND service_type_id = ?`, [
          ...touchVals, id,
        ]);
        await run(`UPDATE service_types SET ${del} WHERE deleted_at IS NULL AND id = ?`, [...delVals, id]);
      }),

    getCustomFieldsForServiceType: (serviceTypeId: Id): Promise<CustomFieldRead[]> => getFields(serviceTypeId, false),

    /** "Load defaults": restores the built-in service types, including deleted ones. */
    restoreDefaultServiceTypes: (): Promise<number> => tx(() => seedBuiltinServiceTypes(db, w, { force: true })),

    // --- Maintenance logs ---
    getLogsForVehicle: (vehicleId: Id, serviceTypeId?: Id): Promise<MaintenanceLogRead[]> => listLogs(vehicleId, serviceTypeId),

    async getLogById(logId: Id): Promise<MaintenanceLogRead | null> {
      const row = await first("SELECT * FROM maintenance_logs WHERE id = ? AND deleted_at IS NULL", [logId]);
      return row ? buildLog(row) : null;
    },

    async createMaintenanceLog(vehicleId: Id, data: MaintenanceLogCreate): Promise<MaintenanceLogRead> {
      validateMaintenanceLog(data);
      const id = await tx(() => insertLog(vehicleId, data));
      return (await repo.getLogById(id))!;
    },

    async updateMaintenanceLog(logId: Id, data: MaintenanceLogUpdate): Promise<MaintenanceLogRead> {
      validateMaintenanceLog(data, true);
      await tx(async () => {
        const sets: string[] = [];
        const vals: SqlValue[] = [];
        if (data.date !== undefined) { sets.push("date = ?"); vals.push(data.date); }
        if (data.mileage !== undefined) { sets.push("mileage = ?"); vals.push(data.mileage); }
        if (data.cost_cents !== undefined) { sets.push("cost_cents = ?"); vals.push(data.cost_cents); }
        if (data.notes !== undefined) { sets.push("notes = ?"); vals.push(data.notes); }
        if (data.service_type_id !== undefined) { sets.push("service_type_id = ?"); vals.push(data.service_type_id); }
        if (sets.length > 0) {
          const [touch, touchVals] = touched();
          await run(`UPDATE maintenance_logs SET ${sets.join(", ")}, ${touch} WHERE id = ? AND deleted_at IS NULL`, [
            ...vals, ...touchVals, logId,
          ]);
        }
        if (data.custom_field_values !== undefined) await syncFieldValues(logId, data.custom_field_values);
      });
      return (await repo.getLogById(logId))!;
    },

    /** Deletes a log; a visit left without items is deleted with it. */
    deleteMaintenanceLog: (logId: Id): Promise<void> =>
      tx(async () => {
        const log = await first<{ event_id: Id | null }>("SELECT event_id FROM maintenance_logs WHERE id = ? AND deleted_at IS NULL", [logId]);
        await tombstoneLog(logId);
        if (log?.event_id && !(await first("SELECT 1 FROM maintenance_logs WHERE event_id = ? AND deleted_at IS NULL", [log.event_id]))) {
          const [del, delVals] = tombstoned();
          await run(`UPDATE service_events SET ${del} WHERE deleted_at IS NULL AND id = ?`, [...delVals, log.event_id]);
        }
      }),

    // --- Service events (garage visits) ---
    /** Newest first; a log outside any visit is listed as a visit of its own (`standalone: true`, id = the log's). */
    getVisitsForVehicle: (vehicleId: Id): Promise<ServiceEventRead[]> => listVisits(vehicleId),

    async getServiceEvent(id: Id): Promise<ServiceEventRead | null> {
      const row = await first("SELECT * FROM service_events WHERE id = ? AND deleted_at IS NULL", [id]);
      return row ? buildEvent(row) : null;
    },

    /** Records a visit and its items (one maintenance log each, at the visit's date and mileage). */
    async createServiceEvent(vehicleId: Id, data: ServiceEventCreate): Promise<ServiceEventRead> {
      validateServiceEvent(data);
      const id = await tx(async () => {
        const eventId = await insertEvent(vehicleId, data);
        for (const item of data.items) {
          await insertLog(vehicleId, { ...item, date: data.date, mileage: data.mileage }, eventId);
        }
        return eventId;
      });
      return (await repo.getServiceEvent(id))!;
    },

    /** Updates the visit's header (a new date or mileage applies to its items) and, if given, its item list. */
    async updateServiceEvent(id: Id, data: ServiceEventUpdate): Promise<ServiceEventRead> {
      validateServiceEvent(data, true);
      await tx(async () => {
        const event = await first("SELECT * FROM service_events WHERE id = ? AND deleted_at IS NULL", [id]);
        if (!event) throw new Error("This visit no longer exists.");
        const sets: string[] = [];
        const vals: SqlValue[] = [];
        if (data.date !== undefined) { sets.push("date = ?"); vals.push(data.date); }
        if (data.mileage !== undefined) { sets.push("mileage = ?"); vals.push(data.mileage); }
        if (data.shop !== undefined) { sets.push("shop = ?"); vals.push(cleanText(data.shop)); }
        if (data.notes !== undefined) { sets.push("notes = ?"); vals.push(cleanText(data.notes)); }
        if (sets.length > 0) {
          const [touch, touchVals] = touched();
          await run(`UPDATE service_events SET ${sets.join(", ")}, ${touch} WHERE id = ?`, [...vals, ...touchVals, id]);
        }
        const date = data.date ?? event.date;
        const mileage = data.mileage ?? event.mileage;
        if (data.items !== undefined) {
          await syncItems(event, date, mileage, data.items);
        } else {
          for (const log of await all("SELECT * FROM maintenance_logs WHERE event_id = ? AND deleted_at IS NULL", [id])) {
            await updateItem(log, { date, mileage });
          }
        }
      });
      return (await repo.getServiceEvent(id))!;
    },

    /** Deletes a visit with its items and their values. */
    deleteServiceEvent: (id: Id): Promise<void> =>
      tx(async () => {
        for (const { id: logId } of await all<{ id: Id }>(
          "SELECT id FROM maintenance_logs WHERE event_id = ? AND deleted_at IS NULL",
          [id],
        )) {
          await tombstoneLog(logId);
        }
        const [del, delVals] = tombstoned();
        await run(`UPDATE service_events SET ${del} WHERE deleted_at IS NULL AND id = ?`, [...delVals, id]);
      }),

    // --- Odometer readings ---
    getOdometerReadings: (vehicleId: Id): Promise<OdometerReadingRead[]> => listReadings(vehicleId),

    async addOdometerReading(vehicleId: Id, data: OdometerReadingCreate): Promise<OdometerReadingRead> {
      validateOdometerReading(data);
      const id = await tx(() => insertReading(vehicleId, data));
      return (await getReading(id))!;
    },

    async updateOdometerReading(id: Id, data: OdometerReadingUpdate): Promise<OdometerReadingRead> {
      validateOdometerReading(data, true);
      await tx(async () => {
        const sets: string[] = [];
        const vals: SqlValue[] = [];
        if (data.date !== undefined) { sets.push("date = ?"); vals.push(data.date); }
        if (data.mileage !== undefined) { sets.push("mileage = ?"); vals.push(data.mileage); }
        if (data.note !== undefined) { sets.push("note = ?"); vals.push(cleanNote(data.note)); }
        if (sets.length > 0) {
          const [touch, touchVals] = touched();
          await run(`UPDATE odometer_readings SET ${sets.join(", ")}, ${touch} WHERE id = ? AND deleted_at IS NULL`, [
            ...vals, ...touchVals, id,
          ]);
        }
      });
      return (await getReading(id))!;
    },

    deleteOdometerReading: (id: Id): Promise<void> =>
      tx(async () => {
        const [del, delVals] = tombstoned();
        await run(`UPDATE odometer_readings SET ${del} WHERE deleted_at IS NULL AND id = ?`, [...delVals, id]);
      }),

    // --- Interval overrides ---
    getOverridesForVehicle: (vehicleId: Id): Promise<VehicleServiceIntervalOverrideRead[]> => listOverrides(vehicleId),

    async upsertIntervalOverride(
      vehicleId: Id,
      serviceTypeId: Id,
      data: VehicleServiceIntervalOverrideCreate,
    ): Promise<VehicleServiceIntervalOverrideRead> {
      validateIntervalOverride(data);
      await writeOverride(vehicleId, serviceTypeId, data);
      return (await first<VehicleServiceIntervalOverrideRead>(
        `SELECT id, vehicle_id, service_type_id, override_interval_km, override_interval_days
         FROM vehicle_service_interval_overrides WHERE vehicle_id = ? AND service_type_id = ?`,
        [vehicleId, serviceTypeId],
      ))!;
    },

    async deleteIntervalOverride(vehicleId: Id, serviceTypeId: Id): Promise<void> {
      const [del, delVals] = tombstoned();
      await run(
        `UPDATE vehicle_service_interval_overrides SET ${del}
         WHERE vehicle_id = ? AND service_type_id = ? AND deleted_at IS NULL`,
        [...delVals, vehicleId, serviceTypeId],
      );
    },

    // --- Summaries ---
    async getMaintenanceSummary(vehicleId: Id, today: Date = new Date()): Promise<MaintenanceSummary> {
      const row = await first(
        `SELECT COUNT(*) AS total_logs, COALESCE(SUM(cost_cents), 0) AS total_cost_cents,
                CAST(ROUND(COALESCE(AVG(cost_cents), 0)) AS INTEGER) AS average_cost_cents,
                MAX(date) AS last_service_date, MAX(mileage) AS last_mileage
         FROM maintenance_logs WHERE vehicle_id = ? AND deleted_at IS NULL`,
        [vehicleId],
      );
      const daysSince = row?.last_service_date
        ? Math.floor((today.getTime() - new Date(row.last_service_date).getTime()) / 86400000)
        : null;
      return {
        vehicle_id: vehicleId,
        total_logs: row?.total_logs ?? 0,
        total_cost_cents: row?.total_cost_cents ?? 0,
        average_cost_cents: row?.average_cost_cents ?? 0,
        last_service_date: row?.last_service_date ?? null,
        days_since_last_service: daysSince,
        last_mileage: row?.last_mileage ?? null,
      };
    },

    getServiceTypeSummaries: (vehicleId: Id): Promise<ServiceTypeLogSummary[]> =>
      all<ServiceTypeLogSummary>(
        `SELECT ml.service_type_id, st.name AS service_type_name, COUNT(*) AS log_count, MAX(ml.date) AS last_log_date,
                MAX(ml.mileage) AS last_log_mileage, COALESCE(SUM(ml.cost_cents), 0) AS total_cost_cents
         FROM maintenance_logs ml
         JOIN service_types st ON ml.service_type_id = st.id AND st.deleted_at IS NULL
         WHERE ml.vehicle_id = ? AND ml.service_type_id IS NOT NULL AND ml.deleted_at IS NULL
         GROUP BY ml.service_type_id
         ORDER BY last_log_date DESC`,
        [vehicleId],
      ),

    // --- Backup ---
    async exportBackup(config: BackupConfiguration, exportedAt: Date = new Date()): Promise<FullBackupData> {
      let vehicles = await repo.getAllVehicles();
      if (config.vehicle_ids?.length) vehicles = vehicles.filter((v) => config.vehicle_ids!.includes(v.id));
      // Odometer readings are history too: they follow the date range and the logs switch.
      if (config.start_date || config.end_date) {
        const inRange = (date: string) =>
          !(config.start_date && date < config.start_date) && !(config.end_date && date > config.end_date);
        vehicles = vehicles.map((v) => ({
          ...v,
          maintenance_logs: v.maintenance_logs.filter((log) => inRange(log.date)),
          odometer_readings: v.odometer_readings.filter((r) => inRange(r.date)),
        }));
      }
      if (config.include_maintenance_logs === false) {
        vehicles = vehicles.map((v) => ({ ...v, maintenance_logs: [], odometer_readings: [] }));
      }
      const serviceEvents = await all<Pick<ServiceEventRead, "id" | "vehicle_id" | "date" | "mileage" | "shop" | "notes">>(
        "SELECT id, vehicle_id, date, mileage, shop, notes FROM service_events WHERE deleted_at IS NULL ORDER BY id",
      );
      return encodeBackup({ serviceTypes: await listServiceTypes(true), vehicles, serviceEvents, config, exportedAt });
    },

    /** Compares a parsed backup with local data: new vehicles, VIN conflicts, VIN-less duplicates. */
    async analyzeBackup(backup: FullBackupData): Promise<BackupAnalysisResponse> {
      const vinRows = await all<{ vin: string; id: Id }>("SELECT vin, id FROM vehicles WHERE vin IS NOT NULL AND deleted_at IS NULL");
      const vinMap = new Map(vinRows.map((v) => [v.vin, v.id]));
      // VIN-less vehicles have no stable identity across devices: treat a backup one as already
      // present when a local VIN-less vehicle has the same make/model/year.
      const noVinRows = await all<{ make: string; model: string; year: number | null }>(
        "SELECT make, model, year FROM vehicles WHERE (vin IS NULL OR TRIM(vin) = '') AND deleted_at IS NULL",
      );
      const noVinKeys = new Set(noVinRows.map((r) => vehicleIdentityKey(r.make, r.model, r.year)));

      const result: Required<BackupAnalysisResponse> = { new_vehicles: [], conflicting_vehicles: [], skipped_duplicates: [] };
      for (const v of backup.vehicles) {
        const info = { id_in_backup: v.id, make: v.make, model: v.model, year: v.year, vin: v.vin, log_count: v.maintenance_logs.length };
        if (v.vin && vinMap.has(v.vin)) {
          result.conflicting_vehicles.push({
            vin: v.vin,
            backup_vehicle: { make: v.make, model: v.model, year: v.year, vin: v.vin },
            existing_vehicle_id: vinMap.get(v.vin)!,
          });
        } else if (!v.vin && noVinKeys.has(vehicleIdentityKey(v.make, v.model, v.year))) {
          result.skipped_duplicates.push(info);
        } else {
          result.new_vehicles.push(info);
        }
      }
      return result;
    },

    /** Imports a parsed backup according to the plan, in one transaction. */
    importBackup: (backup: FullBackupData, plan: RestorePlan): Promise<void> =>
      tx(() => importBackupInTransaction(backup, plan)),

    // --- Preferences (synced) ---
    async getPreferences(): Promise<Preferences> {
      const rows = await all<{ key: string; value: string }>("SELECT key, value FROM preferences WHERE deleted_at IS NULL");
      const stored = Object.fromEntries(rows.map((r) => [r.key, r.value]));
      return {
        currency: stored.currency ?? DEFAULT_PREFERENCES.currency,
        distance_unit: stored.distance_unit === "mi" ? "mi" : DEFAULT_PREFERENCES.distance_unit,
      };
    },

    /** Only sets it if the device has no value yet (adopting an old per-device setting). */
    async setPreference<K extends keyof Preferences>(key: K, value: Preferences[K], opts: { ifUnset?: boolean } = {}): Promise<void> {
      validatePreference(key, value);
      await run(
        `INSERT INTO preferences (key, value, updated_at, deleted_at, device_id) VALUES (?, ?, ?, NULL, ?)
         ON CONFLICT(key) DO ${opts.ifUnset ? "NOTHING" : "UPDATE SET value = excluded.value, deleted_at = NULL, updated_at = excluded.updated_at, device_id = excluded.device_id"}`,
        [key, value, w.stamp(), w.deviceId],
      );
    },

    // --- Device-local settings (not synced) ---
    async getSetting(key: string): Promise<string | null> {
      return (await first<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", [key]))?.value ?? null;
    },
    setSetting: (key: string, value: string): Promise<void> =>
      run("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", [key, value]),
    removeSetting: (key: string): Promise<void> => run("DELETE FROM app_settings WHERE key = ?", [key]),
  };

  return repo;
}
