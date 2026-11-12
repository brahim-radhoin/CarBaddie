import { seedDefaultServiceTypes } from './seed';
import * as SQLite from "expo-sqlite";

const DB_NAME = "car_baddie.db";

let _db: SQLite.SQLiteDatabase | null = null;

/** Get or open the database singleton. */
export async function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (_db) return _db;
  _db = await SQLite.openDatabaseAsync(DB_NAME);
  await _db.execAsync("PRAGMA journal_mode = WAL;");
  await _db.execAsync("PRAGMA foreign_keys = ON;");
  await initSchema(_db);
  await seedDefaultServiceTypes(_db);
  return _db;
}

/** Create all tables if they don't exist. Mirrors the PC backend SQLAlchemy models exactly. */
async function initSchema(db: SQLite.SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS vehicles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      make TEXT NOT NULL,
      model TEXT NOT NULL,
      year INTEGER,
      vin TEXT UNIQUE,
      initial_mileage INTEGER,
      acquisition_date TEXT
    );

    CREATE TABLE IF NOT EXISTS service_types (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      recommended_interval_km INTEGER,
      recommended_interval_days INTEGER
    );

    CREATE TABLE IF NOT EXISTS custom_fields (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      service_type_id INTEGER NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      field_type TEXT NOT NULL CHECK(field_type IN ('text','number','date','boolean')),
      unit TEXT,
      required INTEGER NOT NULL DEFAULT 0,
      sort_order INTEGER NOT NULL DEFAULT 0,
      default_value TEXT,
      UNIQUE(service_type_id, name)
    );

    CREATE TABLE IF NOT EXISTS maintenance_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      service_type_id INTEGER REFERENCES service_types(id) ON DELETE SET NULL,
      date TEXT NOT NULL,
      mileage INTEGER NOT NULL,
      cost REAL NOT NULL DEFAULT 0,
      notes TEXT
    );

    CREATE TABLE IF NOT EXISTS custom_field_values (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      log_id INTEGER NOT NULL REFERENCES maintenance_logs(id) ON DELETE CASCADE,
      field_id INTEGER NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS vehicle_service_interval_overrides (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
      service_type_id INTEGER NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
      override_interval_km INTEGER,
      override_interval_days INTEGER,
      UNIQUE(vehicle_id, service_type_id)
    );

    CREATE TABLE IF NOT EXISTS service_type_resets (
      parent_id INTEGER NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
      reset_id INTEGER NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
      PRIMARY KEY (parent_id, reset_id)
    );

    CREATE TABLE IF NOT EXISTS service_type_suggestions (
      parent_id INTEGER NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
      suggestion_id INTEGER NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
      PRIMARY KEY (parent_id, suggestion_id)
    );

    CREATE INDEX IF NOT EXISTS idx_maintenance_logs_vehicle_id ON maintenance_logs(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_maintenance_logs_service_type_id ON maintenance_logs(service_type_id);
    CREATE INDEX IF NOT EXISTS idx_custom_fields_service_type_id ON custom_fields(service_type_id);
    CREATE INDEX IF NOT EXISTS idx_custom_field_values_log_id ON custom_field_values(log_id);
    CREATE INDEX IF NOT EXISTS idx_custom_field_values_field_id ON custom_field_values(field_id);
    CREATE INDEX IF NOT EXISTS idx_overrides_vehicle_id ON vehicle_service_interval_overrides(vehicle_id);
    CREATE INDEX IF NOT EXISTS idx_overrides_service_type_id ON vehicle_service_interval_overrides(service_type_id);

    CREATE TABLE IF NOT EXISTS app_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);
}
