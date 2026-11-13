// The desktop's database: the shared repository from @carbaddie/core over the SQLite
// connection owned by the Rust shell (src-tauri/src/db.rs).
import { invoke } from "@tauri-apps/api/core";
import { LATEST_SCHEMA_VERSION, openRepository, type OpenedDatabase, type Repository, type SqlDriver } from "@carbaddie/core";

const driver: SqlDriver = {
  exec: (sql) => invoke("db_exec", { sql }),
  all: (sql, params = []) => invoke("db_all", { sql, params }),
  run: async (sql, params = []) => {
    await invoke("db_run", { sql, params });
  },
};

export interface DatabaseInfo extends OpenedDatabase {
  path: string;
  /** Copy of the database taken before this start upgraded its schema. */
  backupPath: string | null;
}

let opening: Promise<DatabaseInfo> | null = null;

/** Opens and migrates the database once; later calls share the result. */
export function openDatabase(): Promise<DatabaseInfo> {
  if (!opening) {
    opening = (async () => {
      const { path, backupPath } = await invoke<{ path: string; backupPath: string | null }>("db_open", {
        latestVersion: LATEST_SCHEMA_VERSION,
      });
      return { path, backupPath, ...(await openRepository(driver)) };
    })().catch((error) => {
      opening = null; // allow a retry
      throw error;
    });
  }
  return opening;
}

export async function getRepository(): Promise<Repository> {
  return (await openDatabase()).repo;
}
