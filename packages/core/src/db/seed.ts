// Seeds the built-in service types (with their resets and suggestions) into a v2 database.

import {
  BUILTIN_RESETS,
  BUILTIN_SERVICE_TYPES,
  BUILTIN_SUGGESTIONS,
  builtinServiceTypeId,
} from "../service-types/builtin.ts";
import type { SqlDriver, WriteContext } from "./driver";

export interface SeedOptions {
  /**
   * Restore defaults: re-add built-ins the user deleted and their default links.
   * Without it, seeding only runs on a database that has never had service types.
   */
  force?: boolean;
}

/** Returns the number of built-in service types added or restored. */
export async function seedBuiltinServiceTypes(
  db: SqlDriver,
  ctx: WriteContext,
  { force = false }: SeedOptions = {},
): Promise<number> {
  if (!force) {
    const [row] = await db.all<{ count: number }>("SELECT COUNT(*) AS count FROM service_types");
    if (Number(row?.count ?? 0) > 0) return 0;
  }

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
        const stamp = ctx.stamp();
        await db.run("UPDATE service_types SET deleted_at = NULL, updated_at = ?, device_id = ? WHERE id = ?", [
          stamp,
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
      [id, builtin.slug, builtin.name, builtin.km, builtin.days, ctx.stamp(), ctx.deviceId],
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
        const stamp = ctx.stamp();
        await db.run(
          `INSERT INTO ${table} (parent_id, ${column}, updated_at, deleted_at, device_id) VALUES (?, ?, ?, NULL, ?)
           ON CONFLICT(parent_id, ${column}) DO UPDATE SET deleted_at = NULL, updated_at = excluded.updated_at,
             device_id = excluded.device_id
           WHERE deleted_at IS NOT NULL`,
          [parentId, childId, stamp, ctx.deviceId],
        );
      }
    }
  }

  return changed;
}
