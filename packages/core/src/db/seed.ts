// Seeds the built-in service types, their links (resets, suggestions) and their default fields.
//
// Runs on every start, so every device has the same built-ins with the same ids whatever its
// history. Rows the seed creates carry SEED_STAMP, older than any real write: when the same row
// arrives from another device where it was edited or deleted, that version wins, so seeding a
// fresh device can never undo a change made elsewhere.

import {
  BUILTIN_RESETS,
  BUILTIN_SERVICE_TYPES,
  BUILTIN_SUGGESTIONS,
  builtinFieldId,
  builtinServiceTypeId,
} from "../service-types/builtin.ts";
import type { SqlDriver, WriteContext } from "./driver";

/** `updated_at` of rows created by seeding: a valid HLC timestamp older than every real one. */
export const SEED_STAMP = "000000000000000-000000-seed";

export interface SeedOptions {
  /**
   * Restore defaults: re-add built-ins the user deleted and their default links.
   * Without it, built-ins that were deleted stay deleted.
   */
  force?: boolean;
}

/** Returns the number of built-in service types added or restored. */
export async function seedBuiltinServiceTypes(
  db: SqlDriver,
  ctx: WriteContext,
  { force = false }: SeedOptions = {},
): Promise<number> {
  // A user's "restore defaults" is a real edit; plain seeding must lose to any real edit.
  const stamp = () => (force ? ctx.stamp() : SEED_STAMP);
  let changed = 0;
  const live = new Set<string>();

  for (const builtin of BUILTIN_SERVICE_TYPES) {
    const id = builtinServiceTypeId(builtin.slug);
    const [existing] = await db.all<{ deleted_at: string | null }>(
      "SELECT deleted_at FROM service_types WHERE id = ?",
      [id],
    );
    if (existing) {
      if (existing.deleted_at === null) {
        live.add(id);
      } else if (force) {
        await db.run("UPDATE service_types SET deleted_at = NULL, updated_at = ?, device_id = ? WHERE id = ?", [
          ctx.stamp(),
          ctx.deviceId,
          id,
        ]);
        live.add(id);
        changed++;
      }
      continue;
    }
    // A custom service type already uses this name; leave it alone.
    const [sameName] = await db.all("SELECT 1 FROM service_types WHERE name = ? AND deleted_at IS NULL", [
      builtin.name,
    ]);
    if (sameName) continue;

    await db.run(
      `INSERT INTO service_types (id, slug, name, recommended_interval_km, recommended_interval_days,
                                  updated_at, deleted_at, device_id)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      [id, builtin.slug, builtin.name, builtin.km, builtin.days, stamp(), ctx.deviceId],
    );
    live.add(id);
    changed++;
  }

  for (const [table, column, links] of [
    ["service_type_resets", "reset_id", BUILTIN_RESETS],
    ["service_type_suggestions", "suggestion_id", BUILTIN_SUGGESTIONS],
  ] as const) {
    for (const [parentSlug, childSlugs] of Object.entries(links)) {
      const parentId = builtinServiceTypeId(parentSlug);
      if (!live.has(parentId)) continue;
      for (const childSlug of childSlugs) {
        const childId = builtinServiceTypeId(childSlug);
        if (!live.has(childId)) continue;
        // New links always; a deleted link only comes back with `force`.
        await db.run(
          `INSERT INTO ${table} (parent_id, ${column}, updated_at, deleted_at, device_id) VALUES (?, ?, ?, NULL, ?)
           ON CONFLICT(parent_id, ${column}) DO ${force
             ? `UPDATE SET deleted_at = NULL, updated_at = excluded.updated_at, device_id = excluded.device_id
                WHERE deleted_at IS NOT NULL`
             : "NOTHING"}`,
          [parentId, childId, stamp(), ctx.deviceId],
        );
      }
    }
  }

  for (const builtin of BUILTIN_SERVICE_TYPES) {
    const serviceTypeId = builtinServiceTypeId(builtin.slug);
    if (!builtin.fields || !live.has(serviceTypeId)) continue;
    for (const [index, field] of builtin.fields.entries()) {
      await seedField(db, ctx, serviceTypeId, builtinFieldId(builtin.slug, field.key), field, index, stamp());
    }
  }

  return changed;
}

/**
 * Makes sure a built-in's default field exists under its fixed id. A field the user archived or
 * deleted keeps its row and is left alone. An active field with the same name but another id
 * (created before built-ins had fields) is moved to the fixed id with its values, so devices
 * don't end up with two copies.
 */
async function seedField(
  db: SqlDriver,
  ctx: WriteContext,
  serviceTypeId: string,
  id: string,
  field: { name: string; field_type: string; unit?: string },
  sortOrder: number,
  stamp: string,
): Promise<void> {
  const [existing] = await db.all("SELECT 1 FROM custom_fields WHERE id = ?", [id]);
  if (existing) return;

  const [sameName] = await db.all<Record<string, string | number | null>>(
    `SELECT * FROM custom_fields WHERE service_type_id = ? AND lower(trim(name)) = lower(trim(?))
       AND archived_at IS NULL AND deleted_at IS NULL`,
    [serviceTypeId, field.name],
  );
  if (!sameName) {
    await db.run(
      `INSERT INTO custom_fields (id, service_type_id, name, field_type, unit, required, sort_order, default_value,
                                  archived_at, updated_at, deleted_at, device_id)
       VALUES (?, ?, ?, ?, ?, 0, ?, NULL, NULL, ?, NULL, ?)`,
      [id, serviceTypeId, field.name, field.field_type, field.unit ?? null, sortOrder, stamp, ctx.deviceId],
    );
    return;
  }

  // Re-key the existing field: free its name, copy it under the fixed id, move its values.
  const now = ctx.stamp();
  await db.run("UPDATE custom_fields SET deleted_at = ?, updated_at = ?, device_id = ? WHERE id = ?", [
    now, now, ctx.deviceId, sameName.id,
  ]);
  await db.run(
    `INSERT INTO custom_fields (id, service_type_id, name, field_type, unit, required, sort_order, default_value,
                                archived_at, updated_at, deleted_at, device_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, NULL, ?)`,
    [id, serviceTypeId, sameName.name, sameName.field_type, sameName.unit, sameName.required, sameName.sort_order,
      sameName.default_value, ctx.stamp(), ctx.deviceId],
  );
  await db.run(
    "UPDATE custom_field_values SET field_id = ?, updated_at = ?, device_id = ? WHERE field_id = ? AND deleted_at IS NULL",
    [id, ctx.stamp(), ctx.deviceId, sameName.id],
  );
}
