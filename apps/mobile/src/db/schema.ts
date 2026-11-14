import * as SQLite from "expo-sqlite";
import { getRandomBytes } from "expo-crypto";
import {
  CURRENCY_BY_SYMBOL,
  openRepository,
  setRandomSource,
  type OpenedDatabase,
  type Repository,
  type SqlDriver,
} from "@carbaddie/core";

const DB_NAME = "car_baddie.db";

// Hermes has no crypto.getRandomValues; ids come from expo-crypto instead.
setRandomSource(getRandomBytes);

function asSqlDriver(db: SQLite.SQLiteDatabase): SqlDriver {
  return {
    exec: (sql) => db.execAsync(sql),
    all: (sql, params = []) => db.getAllAsync(sql, params),
    run: async (sql, params = []) => {
      await db.runAsync(sql, params);
    },
  };
}

let _db: Promise<OpenedDatabase> | null = null;

/** The app's SQLite database with the shared repository (@carbaddie/core) and sync, opened once. */
export function getDatabase(): Promise<OpenedDatabase> {
  if (!_db) {
    _db = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync("PRAGMA journal_mode = WAL;");
      const opened = await openRepository(asSqlDriver(db));
      await adoptLocalPreferences(opened.repo);
      return opened;
    })().catch((error) => {
      _db = null; // let the next call retry instead of caching the failure
      throw error;
    });
  }
  return _db;
}

/**
 * Currency and distance unit used to be per-device settings; they are synced preferences now.
 * An old setting is taken over unless a value already came from sync.
 */
async function adoptLocalPreferences(repo: Repository): Promise<void> {
  const symbol = await repo.getSetting("pref_currency_symbol");
  const currency = symbol ? CURRENCY_BY_SYMBOL[symbol] : undefined;
  if (currency) await repo.setPreference("currency", currency, { ifUnset: true });
  const unit = await repo.getSetting("pref_odometer_unit");
  if (unit === "km" || unit === "mi") await repo.setPreference("distance_unit", unit, { ifUnset: true });
  await repo.removeSetting("pref_currency_symbol");
  await repo.removeSetting("pref_odometer_unit");
}

export async function getRepository(): Promise<Repository> {
  return (await getDatabase()).repo;
}
