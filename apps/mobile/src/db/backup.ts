import type { SQLiteDatabase } from "expo-sqlite";
import {
  builtinServiceTypeId,
  encodeBackup,
  findBuiltinServiceTypeByName,
  vehicleIdentityKey,
  type WriteContext,
} from "@carbaddie/core";
import { getDatabase, getWriteContext } from "./schema";
import * as repo from "./repository";
import type {
  Id, FullBackupData, BackupConfiguration, BackupAnalysisResponse, RestorePlan,
} from "../types";

// Backup files use file-local integer ids (see @carbaddie/core backup/format.ts). Callers
// validate raw JSON with `parseBackup` before passing it here.

// ====================================================================
// EXPORT — Produces the same FullBackupData JSON as the PC app
// ====================================================================

export async function exportBackupData(config: BackupConfiguration): Promise<FullBackupData> {
  const serviceTypes = await repo.getAllServiceTypesForExport();
  let vehicles = await repo.getAllVehicles();

  if (config.vehicle_ids && config.vehicle_ids.length > 0) {
    vehicles = vehicles.filter(v => config.vehicle_ids!.includes(v.id));
  }

  if (config.start_date || config.end_date) {
    vehicles = vehicles.map(v => ({
      ...v,
      maintenance_logs: v.maintenance_logs.filter(log => {
        if (config.start_date && log.date < config.start_date) return false;
        if (config.end_date && log.date > config.end_date) return false;
        return true;
      }),
    }));
  }

  if (config.include_maintenance_logs === false) {
    vehicles = vehicles.map(v => ({ ...v, maintenance_logs: [] }));
  }

  return encodeBackup({ serviceTypes, vehicles, config, exportedAt: new Date() });
}

// ====================================================================
// ANALYZE — Compares backup data against current DB
// ====================================================================

export async function analyzeBackup(backupData: FullBackupData): Promise<BackupAnalysisResponse> {
  const db = await getDatabase();
  const existingVins = await db.getAllAsync<{ vin: string; id: Id }>(
    "SELECT vin, id FROM vehicles WHERE vin IS NOT NULL AND deleted_at IS NULL"
  );
  const vinMap = new Map(existingVins.map(v => [v.vin, v.id]));

  // Vehicles without a VIN have no stable identity across devices. Treat a backup vehicle
  // without a VIN as already present when a local VIN-less vehicle has the same
  // make/model/year, so repeated restores and Drive syncs don't duplicate it.
  const noVinRows = await db.getAllAsync<{ make: string; model: string; year: number | null }>(
    "SELECT make, model, year FROM vehicles WHERE (vin IS NULL OR TRIM(vin) = '') AND deleted_at IS NULL"
  );
  const existingNoVinKeys = new Set(noVinRows.map(r => vehicleIdentityKey(r.make, r.model, r.year)));
  const skippedDuplicates: BackupAnalysisResponse["new_vehicles"] = [];

  const newVehicles: BackupAnalysisResponse["new_vehicles"] = [];
  const conflictingVehicles: BackupAnalysisResponse["conflicting_vehicles"] = [];

  for (const v of backupData.vehicles) {
    const info = {
      id_in_backup: v.id,
      make: v.make,
      model: v.model,
      year: v.year,
      vin: v.vin,
      log_count: v.maintenance_logs.length,
    };

    if (v.vin && vinMap.has(v.vin)) {
      conflictingVehicles.push({
        vin: v.vin,
        backup_vehicle: { make: v.make, model: v.model, year: v.year, vin: v.vin },
        existing_vehicle_id: vinMap.get(v.vin)!,
      });
    } else if (!v.vin && existingNoVinKeys.has(vehicleIdentityKey(v.make, v.model, v.year))) {
      skippedDuplicates.push(info);
    } else {
      newVehicles.push(info);
    }
  }

  return { new_vehicles: newVehicles, conflicting_vehicles: conflictingVehicles, skipped_duplicates: skippedDuplicates };
}

// ====================================================================
// EXECUTE IMPORT — Mirrors PC backend crud/backup.py
// ====================================================================

export async function executeImport(backupData: FullBackupData, plan: RestorePlan): Promise<void> {
  const db = await getDatabase();
  const w = await getWriteContext();
  // One transaction: "replace" deletes the local vehicle before re-inserting it, so a
  // failure halfway must roll back instead of leaving the vehicle deleted.
  await db.withTransactionAsync(() => executeImportInTransaction(db, w, backupData, plan));
}

async function executeImportInTransaction(
  db: SQLiteDatabase, w: WriteContext, backupData: FullBackupData, plan: RestorePlan
): Promise<void> {
  // --- Step 1: Handle Replacements (delete existing vehicles being replaced) ---
  const vinsToReplace = new Set(
    plan.conflict_resolutions.filter(r => r.action === "replace").map(r => r.vin)
  );
  for (const vin of vinsToReplace) {
    const rows = await db.getAllAsync<{ id: Id }>("SELECT id FROM vehicles WHERE vin = ? AND deleted_at IS NULL", [vin]);
    for (const { id } of rows) await repo.tombstoneVehicle(db, w, id);
  }

  // --- Step 2: Assemble vehicles to create ---
  const vehiclesToAddSet = new Set(plan.vehicles_to_add);
  const vehiclesToCreate = backupData.vehicles.filter(
    v => vehiclesToAddSet.has(v.id) || (v.vin && vinsToReplace.has(v.vin))
  );

  if (vehiclesToCreate.length === 0 && backupData.service_types.length === 0) {
    return;
  }

  // --- Step 3: Map file service type and field ids to local ones (matched by name) ---
  const serviceTypeIds = new Map<number, Id>();
  const fieldIds = new Map<number, Id>();

  for (const st of backupData.service_types) {
    const stId = await resolveServiceType(db, w, st);
    serviceTypeIds.set(st.id, stId);

    for (const [index, field] of st.fields.entries()) {
      const existing = await db.getFirstAsync<{ id: Id }>(
        field.archived
          ? `SELECT id FROM custom_fields WHERE service_type_id = ? AND name = ? AND field_type = ?
               AND archived_at IS NOT NULL AND deleted_at IS NULL`
          : `SELECT id FROM custom_fields WHERE service_type_id = ? AND name = ?
               AND archived_at IS NULL AND deleted_at IS NULL`,
        field.archived ? [stId, field.name, field.field_type] : [stId, field.name]
      );
      let fieldId = existing?.id;
      if (!fieldId) {
        fieldId = w.newId();
        const stamp = w.stamp();
        await db.runAsync(
          `INSERT INTO custom_fields (id, service_type_id, name, field_type, unit, required, sort_order, default_value,
                                      archived_at, updated_at, deleted_at, device_id)
           VALUES (?, ?, ?, ?, ?, 0, ?, NULL, ?, ?, NULL, ?)`,
          [fieldId, stId, field.name, field.field_type, field.unit, index, field.archived ? stamp : null, stamp, w.deviceId]
        );
      }
      fieldIds.set(field.id, fieldId);
    }
  }

  // --- Step 3b: Add service type resets & suggestions (links removed locally stay removed) ---
  for (const st of backupData.service_types) {
    const parentId = serviceTypeIds.get(st.id)!;
    for (const [table, column, children] of [
      ["service_type_resets", "reset_id", st.resets],
      ["service_type_suggestions", "suggestion_id", st.suggestions],
    ] as const) {
      for (const child of children) {
        const childId = serviceTypeIds.get(child);
        if (!childId) continue;
        await db.runAsync(
          `INSERT INTO ${table} (parent_id, ${column}, updated_at, deleted_at, device_id) VALUES (?, ?, ?, NULL, ?)
           ON CONFLICT(parent_id, ${column}) DO NOTHING`,
          [parentId, childId, w.stamp(), w.deviceId]
        );
      }
    }
  }

  // --- Step 4: Create vehicles, logs, field values, and overrides ---
  for (const v of vehiclesToCreate) {
    const vehicleId = await repo.insertVehicle(db, w, v);

    for (const log of v.maintenance_logs) {
      await repo.insertMaintenanceLog(db, w, vehicleId, {
        date: log.date || new Date().toISOString().slice(0, 10),
        mileage: log.mileage,
        cost: log.cost,
        notes: log.notes,
        service_type_id: log.service_type_id != null ? (serviceTypeIds.get(log.service_type_id) ?? null) : null,
        custom_field_values: log.custom_field_values.flatMap(cfv => {
          const fieldId = fieldIds.get(cfv.field_id);
          return fieldId ? [{ field_id: fieldId, value: cfv.value }] : [];
        }),
      });
    }

    for (const ov of v.interval_overrides) {
      const serviceTypeId = serviceTypeIds.get(ov.service_type_id);
      if (serviceTypeId) {
        await repo.writeIntervalOverride(db, w, vehicleId, serviceTypeId, ov);
      }
    }
  }
}

/**
 * The local service type for a backup one: the live one with the same name, else the
 * built-in it names (restored if it was deleted), else a new custom one.
 */
async function resolveServiceType(
  db: SQLiteDatabase, w: WriteContext, st: FullBackupData["service_types"][number]
): Promise<Id> {
  const existing = await db.getFirstAsync<{ id: Id }>(
    "SELECT id FROM service_types WHERE name = ? AND deleted_at IS NULL", [st.name]
  );
  if (existing) return existing.id;

  const builtin = findBuiltinServiceTypeByName(st.name);
  if (builtin) {
    const id = builtinServiceTypeId(builtin.slug);
    const row = await db.getFirstAsync<{ id: Id }>("SELECT id FROM service_types WHERE id = ?", [id]);
    if (row) {
      await db.runAsync(
        `UPDATE service_types SET name = ?, recommended_interval_km = ?, recommended_interval_days = ?,
           deleted_at = NULL, updated_at = ?, device_id = ? WHERE id = ?`,
        [st.name, st.recommended_interval_km, st.recommended_interval_days, w.stamp(), w.deviceId, id]
      );
    } else {
      await db.runAsync(
        `INSERT INTO service_types (id, slug, name, recommended_interval_km, recommended_interval_days, updated_at, deleted_at, device_id)
         VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
        [id, builtin.slug, st.name, st.recommended_interval_km, st.recommended_interval_days, w.stamp(), w.deviceId]
      );
    }
    return id;
  }

  const id = w.newId();
  await db.runAsync(
    `INSERT INTO service_types (id, slug, name, recommended_interval_km, recommended_interval_days, updated_at, deleted_at, device_id)
     VALUES (?, NULL, ?, ?, ?, ?, NULL, ?)`,
    [id, st.name, st.recommended_interval_km, st.recommended_interval_days, w.stamp(), w.deviceId]
  );
  return id;
}
