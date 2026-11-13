import * as SQLite from "expo-sqlite";
import { getRandomBytes } from "expo-crypto";
import { openRepository, setRandomSource, type Repository, type SqlDriver } from "@carbaddie/core";

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

let _repo: Promise<Repository> | null = null;

/** The shared repository (@carbaddie/core) over the app's SQLite database, opened once. */
export function getRepository(): Promise<Repository> {
  if (!_repo) {
    _repo = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await db.execAsync("PRAGMA journal_mode = WAL;");
      const { repo } = await openRepository(asSqlDriver(db));
      return repo;
    })().catch((error) => {
      _repo = null; // let the next call retry instead of caching the failure
      throw error;
    });
  }
  return _repo;
}
