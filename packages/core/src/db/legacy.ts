// Folds the service types early desktop versions shipped (LEGACY_SERVICE_TYPES) into the
// built-ins, so a desktop database from those versions ends up with the same list as every
// other device. Runs once per device (opening the database, after seeding). The result is
// ordinary writes, so it syncs; a device that does it after another one reaches the same data.

import { intervalOverrideId } from "../ids/uuid.ts";
import { builtinServiceTypeId, LEGACY_SERVICE_TYPES } from "../service-types/builtin.ts";
import type { SqlDriver, SqlValue, WriteContext } from "./driver";

type Row = Record<string, SqlValue>;

export const LEGACY_MERGE_SETTING = "service_types.legacy_merged";

/** Returns how many legacy service types were merged or deleted. */
export async function mergeLegacyServiceTypes(db: SqlDriver, ctx: WriteContext): Promise<number> {
  const first = async (sql: string, params: SqlValue[]) => (await db.all<Row>(sql, params))[0] ?? null;
  const tombstone = async (table: string, where: string, params: SqlValue[]) => {
    const s = ctx.stamp();
    await db.run(`UPDATE ${table} SET deleted_at = ?, updated_at = ?, device_id = ? WHERE deleted_at IS NULL AND ${where}`, [
      s, s, ctx.deviceId, ...params,
    ]);
  };
  const touch = (): SqlValue[] => [ctx.stamp(), ctx.deviceId];

  let count = 0;
  for (const [name, slug] of Object.entries(LEGACY_SERVICE_TYPES)) {
    const legacy = await first(
      "SELECT * FROM service_types WHERE slug IS NULL AND deleted_at IS NULL AND lower(name) = lower(?)",
      [name],
    );
    if (!legacy) continue;
    const legacyId = legacy.id as string;

    if (slug === null) {
      // Delete only if nothing refers to it.
      const used = await first(
        `SELECT 1 FROM maintenance_logs WHERE service_type_id = ? AND deleted_at IS NULL
         UNION ALL SELECT 1 FROM vehicle_service_interval_overrides WHERE service_type_id = ? AND deleted_at IS NULL`,
        [legacyId, legacyId],
      );
      if (used) continue;
      await tombstone("custom_field_values", "field_id IN (SELECT id FROM custom_fields WHERE service_type_id = ?)", [legacyId]);
      await tombstone("custom_fields", "service_type_id = ?", [legacyId]);
    } else {
      const targetId = builtinServiceTypeId(slug);
      const target = await first("SELECT * FROM service_types WHERE id = ? AND deleted_at IS NULL", [targetId]);
      if (!target) continue; // the user deleted the built-in: keep their type

      // Fields: values go to the built-in's field of the same name, or the field moves over.
      for (const field of await db.all<Row>("SELECT * FROM custom_fields WHERE service_type_id = ? AND deleted_at IS NULL", [
        legacyId,
      ])) {
        const twin =
          field.archived_at === null
            ? await first(
                `SELECT id FROM custom_fields WHERE service_type_id = ? AND lower(trim(name)) = lower(trim(?))
                   AND archived_at IS NULL AND deleted_at IS NULL`,
                [targetId, field.name],
              )
            : null;
        if (twin) {
          await db.run(
            "UPDATE custom_field_values SET field_id = ?, updated_at = ?, device_id = ? WHERE field_id = ? AND deleted_at IS NULL",
            [twin.id, ...touch(), field.id],
          );
          await tombstone("custom_fields", "id = ?", [field.id]);
        } else {
          await db.run("UPDATE custom_fields SET service_type_id = ?, updated_at = ?, device_id = ? WHERE id = ?", [
            targetId, ...touch(), field.id,
          ]);
        }
      }

      await db.run(
        "UPDATE maintenance_logs SET service_type_id = ?, updated_at = ?, device_id = ? WHERE service_type_id = ? AND deleted_at IS NULL",
        [targetId, ...touch(), legacyId],
      );

      // Overrides: the built-in keeps its own where it has one for that vehicle.
      for (const ov of await db.all<Row>(
        "SELECT * FROM vehicle_service_interval_overrides WHERE service_type_id = ? AND deleted_at IS NULL",
        [legacyId],
      )) {
        const taken = await first(
          "SELECT 1 FROM vehicle_service_interval_overrides WHERE vehicle_id = ? AND service_type_id = ? AND deleted_at IS NULL",
          [ov.vehicle_id, targetId],
        );
        await tombstone("vehicle_service_interval_overrides", "id = ?", [ov.id]);
        if (taken) continue;
        await db.run(
          `INSERT INTO vehicle_service_interval_overrides (id, vehicle_id, service_type_id, override_interval_km,
                                                           override_interval_days, updated_at, deleted_at, device_id)
           VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
           ON CONFLICT(vehicle_id, service_type_id) DO UPDATE SET
             override_interval_km = excluded.override_interval_km,
             override_interval_days = excluded.override_interval_days,
             deleted_at = NULL, updated_at = excluded.updated_at, device_id = excluded.device_id`,
          [intervalOverrideId(ov.vehicle_id as string, targetId), ov.vehicle_id, targetId,
            ov.override_interval_km, ov.override_interval_days, ...touch()],
        );
      }

      // The user's own intervals replace the built-in's defaults.
      const km = legacy.recommended_interval_km ?? target.recommended_interval_km;
      const days = legacy.recommended_interval_days ?? target.recommended_interval_days;
      if (km !== target.recommended_interval_km || days !== target.recommended_interval_days) {
        await db.run(
          "UPDATE service_types SET recommended_interval_km = ?, recommended_interval_days = ?, updated_at = ?, device_id = ? WHERE id = ?",
          [km, days, ...touch(), targetId],
        );
      }
      await tombstone("vehicle_service_interval_overrides", "service_type_id = ?", [legacyId]);
    }

    await tombstone("service_type_resets", "(parent_id = ? OR reset_id = ?)", [legacyId, legacyId]);
    await tombstone("service_type_suggestions", "(parent_id = ? OR suggestion_id = ?)", [legacyId, legacyId]);
    await tombstone("service_types", "id = ?", [legacyId]);
    count++;
  }
  return count;
}
