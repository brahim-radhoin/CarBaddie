// The desktop's database: the shared repository from @carbaddie/core over the SQLite
// connection owned by the Rust shell (src-tauri/src/db.rs).
import { invoke } from "@tauri-apps/api/core";
import {
  CURRENCY_BY_SYMBOL,
  LATEST_SCHEMA_VERSION,
  openRepository,
  type OpenedDatabase,
  type Repository,
  type SqlDriver,
} from "@carbaddie/core";

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
      const opened = await openRepository(driver);
      await adoptLocalPreferences(opened.repo);
      return { path, backupPath, ...opened };
    })().catch((error) => {
      opening = null; // allow a retry
      throw error;
    });
  }
  return opening;
}

/**
 * Currency and distance unit used to be per-device localStorage settings; they are synced
 * preferences now. An old setting is taken over unless a value already came from sync.
 */
async function adoptLocalPreferences(repo: Repository): Promise<void> {
  const symbol = localStorage.getItem("pref_currency_symbol");
  const currency = symbol ? CURRENCY_BY_SYMBOL[symbol] : undefined;
  if (currency) await repo.setPreference("currency", currency, { ifUnset: true });
  const unit = localStorage.getItem("pref_odometer_unit");
  if (unit === "km" || unit === "mi") await repo.setPreference("distance_unit", unit, { ifUnset: true });
  localStorage.removeItem("pref_currency_symbol");
  localStorage.removeItem("pref_odometer_unit");
}

export async function getRepository(): Promise<Repository> {
  return (await openDatabase()).repo;
}
