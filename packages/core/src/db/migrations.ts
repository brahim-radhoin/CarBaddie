// Versioned schema migrations for the local SQLite database, tracked in `PRAGMA user_version`.
//
// Rules: never edit a migration that has shipped; add a new one. Each migration runs in its
// own transaction with foreign keys off (needed to rebuild tables). Migrations that rewrite
// data must leave `PRAGMA foreign_key_check` clean, otherwise they are rolled back.

import { intervalOverrideId } from "../ids/uuid.ts";
import { builtinServiceTypeId, findBuiltinServiceTypeByName } from "../service-types/builtin.ts";
import type { SqlDriver, WriteContext } from "./driver";

interface Migration {
  version: number;
  description: string;
  /**
   * Fail the migration if foreign keys are violated afterwards. Off for v1: databases from
   * before foreign keys were enforced can already hold orphans, which v2 removes.
   */
  checkForeignKeys: boolean;
  up(db: SqlDriver, ctx: WriteContext): Promise<void>;
}

/**
 * v1: the schema the mobile app created with CREATE TABLE IF NOT EXISTS before migrations
 * existed (integer ids). Existing installs already have it and are at user_version 0, so
 * this is a no-op for them; fresh installs get it and go straight on to v2.
 */
const V1_LEGACY_SCHEMA = `
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
`;

/**
 * Sync columns on every synced table:
 * - updated_at: HLC timestamp of the last write (last writer wins on merge)
 * - deleted_at: HLC timestamp of deletion; rows are tombstoned, never removed, so the
 *   deletion can be synced
 * - device_id: the device that made the last write
 */
const SYNC_COLUMNS = `updated_at TEXT NOT NULL, deleted_at TEXT, device_id TEXT NOT NULL`;

const V2_TABLES = `
  CREATE TABLE vehicles_v2 (
    id TEXT PRIMARY KEY NOT NULL,
    make TEXT NOT NULL,
    model TEXT NOT NULL,
    year INTEGER,
    vin TEXT,
    initial_mileage INTEGER,
    acquisition_date TEXT,
    ${SYNC_COLUMNS}
  );
  CREATE TABLE service_types_v2 (
    id TEXT PRIMARY KEY NOT NULL,
    slug TEXT,
    name TEXT NOT NULL,
    recommended_interval_km INTEGER,
    recommended_interval_days INTEGER,
    ${SYNC_COLUMNS}
  );
  CREATE TABLE custom_fields_v2 (
    id TEXT PRIMARY KEY NOT NULL,
    service_type_id TEXT NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    field_type TEXT NOT NULL CHECK(field_type IN ('text','number','date','boolean')),
    unit TEXT,
    required INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    default_value TEXT,
    archived_at TEXT,
    ${SYNC_COLUMNS}
  );
  CREATE TABLE maintenance_logs_v2 (
    id TEXT PRIMARY KEY NOT NULL,
    vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    service_type_id TEXT REFERENCES service_types(id) ON DELETE SET NULL,
    date TEXT NOT NULL,
    mileage INTEGER NOT NULL,
    cost REAL NOT NULL DEFAULT 0,
    notes TEXT,
    ${SYNC_COLUMNS}
  );
  CREATE TABLE custom_field_values_v2 (
    id TEXT PRIMARY KEY NOT NULL,
    log_id TEXT NOT NULL REFERENCES maintenance_logs(id) ON DELETE CASCADE,
    field_id TEXT NOT NULL REFERENCES custom_fields(id) ON DELETE CASCADE,
    value TEXT NOT NULL,
    ${SYNC_COLUMNS}
  );
  CREATE TABLE vehicle_service_interval_overrides_v2 (
    id TEXT PRIMARY KEY NOT NULL,
    vehicle_id TEXT NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
    service_type_id TEXT NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
    override_interval_km INTEGER,
    override_interval_days INTEGER,
    ${SYNC_COLUMNS},
    UNIQUE(vehicle_id, service_type_id)
  );
  CREATE TABLE service_type_resets_v2 (
    parent_id TEXT NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
    reset_id TEXT NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
    ${SYNC_COLUMNS},
    PRIMARY KEY (parent_id, reset_id)
  );
  CREATE TABLE service_type_suggestions_v2 (
    parent_id TEXT NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
    suggestion_id TEXT NOT NULL REFERENCES service_types(id) ON DELETE CASCADE,
    ${SYNC_COLUMNS},
    PRIMARY KEY (parent_id, suggestion_id)
  );
`;

const V2_INDEXES = `
  CREATE UNIQUE INDEX ux_vehicles_vin ON vehicles(vin) WHERE vin IS NOT NULL AND deleted_at IS NULL;
  CREATE UNIQUE INDEX ux_service_types_name ON service_types(name) WHERE deleted_at IS NULL;
  CREATE UNIQUE INDEX ux_service_types_slug ON service_types(slug) WHERE slug IS NOT NULL;
  CREATE UNIQUE INDEX ux_custom_fields_active_name ON custom_fields(service_type_id, name)
    WHERE archived_at IS NULL AND deleted_at IS NULL;
  CREATE INDEX idx_maintenance_logs_vehicle_id ON maintenance_logs(vehicle_id);
  CREATE INDEX idx_maintenance_logs_service_type_id ON maintenance_logs(service_type_id);
  CREATE INDEX idx_custom_fields_service_type_id ON custom_fields(service_type_id);
  CREATE INDEX idx_custom_field_values_log_id ON custom_field_values(log_id);
  CREATE INDEX idx_custom_field_values_field_id ON custom_field_values(field_id);
  CREATE INDEX idx_overrides_vehicle_id ON vehicle_service_interval_overrides(vehicle_id);
  CREATE INDEX idx_overrides_service_type_id ON vehicle_service_interval_overrides(service_type_id);
`;

/** Tables rebuilt by v2, in an order where every table's references come before it. */
const V2_REBUILT_TABLES = [
  "vehicles",
  "service_types",
  "custom_fields",
  "maintenance_logs",
  "custom_field_values",
  "vehicle_service_interval_overrides",
  "service_type_resets",
  "service_type_suggestions",
] as const;

/**
 * v2: sync-ready data model. Integer ids become UUIDs (built-in service types and interval
 * overrides get deterministic ones), every synced table gets sync columns, custom fields can
 * be archived, and uniqueness only applies to live rows. Every row is carried over; rows that
 * already pointed at a missing parent (possible because foreign keys were not enforced before)
 * are dropped, or for a log's missing service type, set to NULL like ON DELETE SET NULL did.
 * Also accepts the desktop backend's copy of this schema (nullable date/mileage/cost, free-text
 * field_type) so the desktop can run it in roadmap step 4.
 */
async function migrateV2(db: SqlDriver, ctx: WriteContext): Promise<void> {
  const stamp = ctx.stamp();
  const device = ctx.deviceId;

  await db.exec(`
    DROP TABLE IF EXISTS temp.id_map;
    CREATE TEMP TABLE id_map (tbl TEXT NOT NULL, old INTEGER NOT NULL, new TEXT NOT NULL, slug TEXT,
                              PRIMARY KEY (tbl, old));
  `);
  const mapIds = async (tbl: string, ids: { id: number }[]) => {
    for (const { id } of ids) {
      await db.run("INSERT INTO id_map (tbl, old, new) VALUES (?, ?, ?)", [tbl, id, ctx.newId()]);
    }
  };

  // Old rows keep their order: UUIDv7 ids generated in sequence sort like the old integers.
  await mapIds("vehicles", await db.all<{ id: number }>("SELECT id FROM vehicles ORDER BY id"));

  // A service type named like a built-in becomes that built-in, so devices converge on one row.
  const usedSlugs = new Set<string>();
  for (const st of await db.all<{ id: number; name: string }>("SELECT id, name FROM service_types ORDER BY id")) {
    const builtin = findBuiltinServiceTypeByName(st.name);
    if (builtin && !usedSlugs.has(builtin.slug)) {
      usedSlugs.add(builtin.slug);
      await db.run("INSERT INTO id_map (tbl, old, new, slug) VALUES ('service_types', ?, ?, ?)", [
        st.id,
        builtinServiceTypeId(builtin.slug),
        builtin.slug,
      ]);
    } else {
      await db.run("INSERT INTO id_map (tbl, old, new) VALUES ('service_types', ?, ?)", [st.id, ctx.newId()]);
    }
  }

  await mapIds("custom_fields", await db.all<{ id: number }>("SELECT id FROM custom_fields ORDER BY id"));
  await mapIds("maintenance_logs", await db.all<{ id: number }>("SELECT id FROM maintenance_logs ORDER BY id"));
  await mapIds("custom_field_values", await db.all<{ id: number }>("SELECT id FROM custom_field_values ORDER BY id"));

  const overrides = await db.all<{ id: number; vehicle_id: string; service_type_id: string }>(`
    SELECT o.id, mv.new AS vehicle_id, ms.new AS service_type_id
    FROM vehicle_service_interval_overrides o
    JOIN id_map mv ON mv.tbl = 'vehicles' AND mv.old = o.vehicle_id
    JOIN id_map ms ON ms.tbl = 'service_types' AND ms.old = o.service_type_id
  `);
  for (const o of overrides) {
    await db.run("INSERT INTO id_map (tbl, old, new) VALUES ('vehicle_service_interval_overrides', ?, ?)", [
      o.id,
      intervalOverrideId(o.vehicle_id, o.service_type_id),
    ]);
  }

  await db.exec(V2_TABLES);
  const sync = [stamp, device];

  await db.run(
    `INSERT INTO vehicles_v2 (id, make, model, year, vin, initial_mileage, acquisition_date, updated_at, deleted_at, device_id)
     SELECT m.new, v.make, v.model, v.year, v.vin, v.initial_mileage, v.acquisition_date, ?, NULL, ?
     FROM vehicles v JOIN id_map m ON m.tbl = 'vehicles' AND m.old = v.id`,
    sync,
  );
  await db.run(
    `INSERT INTO service_types_v2 (id, slug, name, recommended_interval_km, recommended_interval_days, updated_at, deleted_at, device_id)
     SELECT m.new, m.slug, s.name, s.recommended_interval_km, s.recommended_interval_days, ?, NULL, ?
     FROM service_types s JOIN id_map m ON m.tbl = 'service_types' AND m.old = s.id`,
    sync,
  );
  await db.run(
    `INSERT INTO custom_fields_v2 (id, service_type_id, name, field_type, unit, required, sort_order, default_value,
                                   archived_at, updated_at, deleted_at, device_id)
     SELECT m.new, ms.new, f.name,
            CASE WHEN f.field_type IN ('text','number','date','boolean') THEN f.field_type ELSE 'text' END,
            f.unit, COALESCE(f.required, 0), COALESCE(f.sort_order, 0), f.default_value, NULL, ?, NULL, ?
     FROM custom_fields f
     JOIN id_map m ON m.tbl = 'custom_fields' AND m.old = f.id
     JOIN id_map ms ON ms.tbl = 'service_types' AND ms.old = f.service_type_id`,
    sync,
  );
  await db.run(
    `INSERT INTO maintenance_logs_v2 (id, vehicle_id, service_type_id, date, mileage, cost, notes, updated_at, deleted_at, device_id)
     SELECT m.new, mv.new, ms.new, COALESCE(l.date, date('now')), COALESCE(l.mileage, 0), COALESCE(l.cost, 0),
            l.notes, ?, NULL, ?
     FROM maintenance_logs l
     JOIN id_map m ON m.tbl = 'maintenance_logs' AND m.old = l.id
     JOIN id_map mv ON mv.tbl = 'vehicles' AND mv.old = l.vehicle_id
     LEFT JOIN id_map ms ON ms.tbl = 'service_types' AND ms.old = l.service_type_id`,
    sync,
  );
  await db.run(
    `INSERT INTO custom_field_values_v2 (id, log_id, field_id, value, updated_at, deleted_at, device_id)
     SELECT m.new, ml.new, mf.new, c.value, ?, NULL, ?
     FROM custom_field_values c
     JOIN id_map m ON m.tbl = 'custom_field_values' AND m.old = c.id
     JOIN id_map ml ON ml.tbl = 'maintenance_logs' AND ml.old = c.log_id
     JOIN maintenance_logs_v2 l2 ON l2.id = ml.new
     JOIN id_map mf ON mf.tbl = 'custom_fields' AND mf.old = c.field_id
     JOIN custom_fields_v2 f2 ON f2.id = mf.new`,
    sync,
  );
  await db.run(
    `INSERT INTO vehicle_service_interval_overrides_v2 (id, vehicle_id, service_type_id, override_interval_km,
                                                        override_interval_days, updated_at, deleted_at, device_id)
     SELECT m.new, mv.new, ms.new, o.override_interval_km, o.override_interval_days, ?, NULL, ?
     FROM vehicle_service_interval_overrides o
     JOIN id_map m ON m.tbl = 'vehicle_service_interval_overrides' AND m.old = o.id
     JOIN id_map mv ON mv.tbl = 'vehicles' AND mv.old = o.vehicle_id
     JOIN id_map ms ON ms.tbl = 'service_types' AND ms.old = o.service_type_id`,
    sync,
  );
  for (const [table, column] of [
    ["service_type_resets", "reset_id"],
    ["service_type_suggestions", "suggestion_id"],
  ] as const) {
    await db.run(
      `INSERT OR IGNORE INTO ${table}_v2 (parent_id, ${column}, updated_at, deleted_at, device_id)
       SELECT mp.new, mc.new, ?, NULL, ?
       FROM ${table} j
       JOIN id_map mp ON mp.tbl = 'service_types' AND mp.old = j.parent_id
       JOIN id_map mc ON mc.tbl = 'service_types' AND mc.old = j.${column}`,
      sync,
    );
  }

  for (const table of [...V2_REBUILT_TABLES].reverse()) {
    await db.exec(`DROP TABLE ${table}`);
  }
  for (const table of V2_REBUILT_TABLES) {
    await db.exec(`ALTER TABLE ${table}_v2 RENAME TO ${table}`);
  }
  await db.exec(V2_INDEXES);
  await db.exec("DROP TABLE temp.id_map");
}

export const MIGRATIONS: readonly Migration[] = [
  { version: 1, description: "legacy integer-id schema", checkForeignKeys: false, up: (db) => db.exec(V1_LEGACY_SCHEMA) },
  { version: 2, description: "UUID ids, sync columns, archivable custom fields", checkForeignKeys: true, up: migrateV2 },
  {
    // The vehicle catalog is a read-only app asset now, and Alembic no longer manages the
    // desktop database; both tables only exist in databases created by the Python backend.
    version: 3,
    description: "drop backend-only tables",
    checkForeignKeys: false,
    up: (db) => db.exec("DROP TABLE IF EXISTS vehicle_definitions; DROP TABLE IF EXISTS alembic_version;"),
  },
  {
    // Sync merges two live vehicles with the same VIN into one: the duplicate is tombstoned
    // and points at the vehicle it was merged into, so logs that arrive for it later
    // (from a device that hadn't seen the merge yet) can be moved over too.
    version: 4,
    description: "vehicles.merged_into for sync merges",
    checkForeignKeys: false,
    up: (db) => db.exec("ALTER TABLE vehicles ADD COLUMN merged_into TEXT"),
  },
];

export const LATEST_SCHEMA_VERSION = MIGRATIONS[MIGRATIONS.length - 1].version;

export async function getSchemaVersion(db: SqlDriver): Promise<number> {
  const [row] = await db.all<{ user_version: number }>("PRAGMA user_version");
  return Number(row?.user_version ?? 0);
}

/**
 * Brings the database to the latest schema. Safe to call on every start. Leaves foreign key
 * enforcement ON. Throws (after rolling back the failing migration) if a migration fails.
 */
export async function migrate(db: SqlDriver, ctx: WriteContext): Promise<{ from: number; to: number }> {
  const from = await getSchemaVersion(db);
  if (from > LATEST_SCHEMA_VERSION) {
    throw new Error(
      `Database schema v${from} is newer than this app supports (v${LATEST_SCHEMA_VERSION}). Update the app.`,
    );
  }

  // Must be set outside a transaction; rebuilding tables needs enforcement off.
  await db.exec("PRAGMA foreign_keys = OFF");
  try {
    for (const migration of MIGRATIONS) {
      if (migration.version <= from) continue;
      await db.exec("BEGIN IMMEDIATE");
      try {
        await migration.up(db, ctx);
        const violations = migration.checkForeignKeys ? await db.all("PRAGMA foreign_key_check") : [];
        if (violations.length > 0) {
          throw new Error(`Migration v${migration.version} left ${violations.length} foreign key violation(s)`);
        }
        await db.exec(`PRAGMA user_version = ${migration.version}`);
        await db.exec("COMMIT");
      } catch (error) {
        await db.exec("ROLLBACK");
        throw error;
      }
    }
  } finally {
    await db.exec("PRAGMA foreign_keys = ON");
  }
  return { from, to: LATEST_SCHEMA_VERSION };
}
