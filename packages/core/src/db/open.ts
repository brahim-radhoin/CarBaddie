// Opening the local database: device identity, schema migrations, clock and seed data.
// Both apps call this once at startup with their own SqlDriver.

import { uuidv7 } from "../ids/uuid.ts";
import { HlcClock } from "../sync/hlc.ts";
import { migrate } from "./migrations.ts";
import { createRepository, type Repository } from "./repository.ts";
import { seedBuiltinServiceTypes } from "./seed.ts";
import { resetSyncState, runSync } from "../sync/engine.ts";
import { SYNCED_TABLES } from "../sync/tables.ts";
import type { SqlDriver, WriteContext } from "./driver";
import type { SyncOptions, SyncResult } from "../sync/engine";
import type { SyncTransport } from "../sync/transport";

export { SYNCED_TABLES };

const DEVICE_ID_KEY = "device_id";

export interface OpenedDatabase {
  repo: Repository;
  deviceId: string;
  /** Schema versions before and after opening. */
  migrated: { from: number; to: number };
  /** Pulls other devices' changes, merges them and pushes this device's (sync/engine.ts). */
  sync(transport: SyncTransport, options?: SyncOptions): Promise<SyncResult>;
  /** Forget sync progress, e.g. after connecting another account; the next sync re-sends everything. */
  resetSync(): Promise<void>;
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
  const ctx: WriteContext = {
    deviceId,
    stamp: () => clock.now(),
    newId: () => uuidv7(wallClock()),
    observe: (stamp) => clock.observe(stamp),
  };

  const migrated = await migrate(db, ctx); // leaves foreign key enforcement on

  // Never issue a timestamp older than one already stored (e.g. after the wall clock moved back).
  const latest = await db.all<{ latest: string | null }>(
    `SELECT MAX(updated_at) AS latest FROM (${SYNCED_TABLES.map((t) => `SELECT MAX(updated_at) AS updated_at FROM ${t}`).join(" UNION ALL ")})`,
  );
  if (latest[0]?.latest) clock.observe(latest[0].latest);

  await seedBuiltinServiceTypes(db, ctx);
  return {
    repo: createRepository(db, ctx),
    deviceId,
    migrated,
    sync: (transport, options) => runSync(db, ctx, transport, options),
    resetSync: () => resetSyncState(db),
  };
}
