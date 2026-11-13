import * as SQLite from "expo-sqlite";
import { getRandomBytes } from "expo-crypto";
import {
  HlcClock,
  migrate,
  seedBuiltinServiceTypes,
  setRandomSource,
  uuidv7,
  type SqlDriver,
  type WriteContext,
} from "@carbaddie/core";

const DB_NAME = "car_baddie.db";
const DEVICE_ID_KEY = "device_id";

// Hermes has no crypto.getRandomValues; ids come from expo-crypto instead.
setRandomSource(getRandomBytes);

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

let _db: Promise<SQLite.SQLiteDatabase> | null = null;
let _ctx: WriteContext | null = null;

/** Get or open the database singleton: migrates it and seeds the built-ins on first use. */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!_db) {
    _db = openDatabase().catch((error) => {
      _db = null; // let the next call retry instead of caching the failure
      throw error;
    });
  }
  return _db;
}

/** Stamps for the sync columns of the next write. Only valid after getDatabase() resolved. */
export async function getWriteContext(): Promise<WriteContext> {
  await getDatabase();
  return _ctx!;
}

export function asSqlDriver(db: SQLite.SQLiteDatabase): SqlDriver {
  return {
    exec: (sql) => db.execAsync(sql),
    all: (sql, params = []) => db.getAllAsync(sql, params),
    run: async (sql, params = []) => {
      await db.runAsync(sql, params);
    },
  };
}

async function openDatabase(): Promise<SQLite.SQLiteDatabase> {
  const db = await SQLite.openDatabaseAsync(DB_NAME);
  await db.execAsync("PRAGMA journal_mode = WAL;");
  const driver = asSqlDriver(db);

  // app_settings exists in every schema version, so the device id can be read before migrating.
  await db.execAsync("CREATE TABLE IF NOT EXISTS app_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);");
  let deviceId = (await db.getFirstAsync<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", [DEVICE_ID_KEY]))?.value;
  if (!deviceId) {
    deviceId = uuidv7();
    await db.runAsync("INSERT INTO app_settings (key, value) VALUES (?, ?)", [DEVICE_ID_KEY, deviceId]);
  }

  const clock = new HlcClock(deviceId);
  const ctx: WriteContext = { deviceId, stamp: () => clock.now(), newId: () => uuidv7() };

  await migrate(driver, ctx); // also turns foreign key enforcement on

  // Never issue a timestamp older than one already stored (e.g. after the wall clock moved back).
  const latest = await db.getFirstAsync<{ latest: string | null }>(
    `SELECT MAX(updated_at) AS latest FROM (${SYNCED_TABLES.map((t) => `SELECT MAX(updated_at) AS updated_at FROM ${t}`).join(" UNION ALL ")})`,
  );
  if (latest?.latest) clock.observe(latest.latest);

  await seedBuiltinServiceTypes(driver, ctx);
  _ctx = ctx;
  return db;
}
