import * as SQLite from "expo-sqlite";
import { getRandomBytes } from "expo-crypto";
import { openRepository, setRandomSource, type OpenedDatabase, type Repository, type SqlDriver } from "@carbaddie/core";

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
      return openRepository(asSqlDriver(db));
    })().catch((error) => {
      _db = null; // let the next call retry instead of caching the failure
      throw error;
    });
  }
  return _db;
}

export async function getRepository(): Promise<Repository> {
  return (await getDatabase()).repo;
}
