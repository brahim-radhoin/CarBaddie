// Opening the local database: device identity, schema migrations, clock and seed data.
// Both apps call this once at startup with their own SqlDriver.

import { uuidv7 } from "../ids/uuid.ts";
import { HlcClock } from "../sync/hlc.ts";
import { migrate } from "./migrations.ts";
import { createRepository, type Repository } from "./repository.ts";
import { seedBuiltinServiceTypes } from "./seed.ts";
import type { SqlDriver, WriteContext } from "./driver";

/** Tables that carry sync columns (updated_at, deleted_at, device_id). */
export const SYNCED_TABLES = [
  "vehicles",
  "service_types",
  "custom_fields",
  "maintenance_logs",
  "custom_field_values",
  "vehicle_service_interval_overrides",
  "service_type_resets",
  "service_type_suggestions",
] as const;

const DEVICE_ID_KEY = "device_id";

export interface OpenedDatabase {
  repo: Repository;
  deviceId: string;
  /** Schema versions before and after opening. */
  migrated: { from: number; to: number };
}

export async function openRepository(db: SqlDriver, wallClock: () => number = Date.now): Promise<OpenedDatabase> {
  // app_settings exists in every schema version, so the device id can be read before migrating.
  await db.exec("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
  let [row] = await db.all<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", [DEVICE_ID_KEY]);
  let deviceId = row?.value;
  if (!deviceId) {
    deviceId = uuidv7(wallClock());
    await db.run("INSERT INTO app_settings (key, value) VALUES (?, ?)", [DEVICE_ID_KEY, deviceId]);
  }

  const clock = new HlcClock(deviceId, null, wallClock);
  const ctx: WriteContext = { deviceId, stamp: () => clock.now(), newId: () => uuidv7(wallClock()) };

  const migrated = await migrate(db, ctx); // leaves foreign key enforcement on

  // Never issue a timestamp older than one already stored (e.g. after the wall clock moved back).
  const latest = await db.all<{ latest: string | null }>(
    `SELECT MAX(updated_at) AS latest FROM (${SYNCED_TABLES.map((t) => `SELECT MAX(updated_at) AS updated_at FROM ${t}`).join(" UNION ALL ")})`,
  );
  if (latest[0]?.latest) clock.observe(latest[0].latest);

  await seedBuiltinServiceTypes(db, ctx);
  return { repo: createRepository(db, ctx), deviceId, migrated };
}
