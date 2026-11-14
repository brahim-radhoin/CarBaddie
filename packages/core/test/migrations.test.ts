// Migrations are run on copies of database files, never in place, and the original is
// checked afterwards to be untouched.
import { test } from "node:test";
import assert from "node:assert/strict";
import { copyFileSync, existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { getSchemaVersion, LATEST_SCHEMA_VERSION, migrate, MIGRATIONS } from "../src/db/migrations.ts";
import { seedBuiltinServiceTypes } from "../src/db/seed.ts";
import { intervalOverrideId, isUuid } from "../src/ids/uuid.ts";
import { builtinServiceTypeId, BUILTIN_SERVICE_TYPES } from "../src/service-types/builtin.ts";
import { openTestDb, testContext } from "./helpers/sqlite.ts";

const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

function withTempDir(fn: (dir: string) => Promise<void>) {
  return async () => {
    const dir = mkdtempSync(join(tmpdir(), "carbaddie-migrate-"));
    try {
      await fn(dir);
    } finally {
      // Best effort: on Windows a handle left open by a failed assertion would mask the failure.
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {}
    }
  };
}

/** A v1 (legacy mobile) database with one of everything, plus orphans from the FK-off days. */
async function createLegacyDb(path: string) {
  const db = openTestDb(path);
  await MIGRATIONS[0].up(db, testContext());
  db.raw.exec(`
    INSERT INTO vehicles (id, make, model, year, vin, initial_mileage, acquisition_date) VALUES
      (1, 'Toyota', 'Corolla', 2015, 'JTDBR32E720012345', 90000, '2020-01-15'),
      (2, 'Honda', 'Civic', NULL, NULL, NULL, NULL);
    INSERT INTO service_types (id, name, recommended_interval_km, recommended_interval_days) VALUES
      (1, 'Oil Change', 8000, 180),
      (2, 'Oil Filter Replacement', 8000, 180),
      (3, 'Detailing', NULL, 90);
    INSERT INTO custom_fields (id, service_type_id, name, field_type, unit, required, sort_order, default_value) VALUES
      (1, 1, 'Oil grade', 'text', NULL, 1, 0, '5W-30'),
      (2, 1, 'Quantity', 'number', 'L', 0, 1, NULL);
    INSERT INTO maintenance_logs (id, vehicle_id, service_type_id, date, mileage, cost, notes) VALUES
      (1, 1, 1, '2025-06-01', 95000, 79.5, 'synthetic'),
      (2, 1, 3, '2025-07-01', 96000, 40, NULL),
      (3, 2, NULL, '2025-08-01', 1000, 0, 'misc'),
      (4, 2, 99, '2025-09-01', 2000, 10, 'service type deleted while FKs were off'),
      (5, 42, 1, '2025-09-02', 3000, 10, 'vehicle deleted while FKs were off');
    INSERT INTO custom_field_values (id, log_id, field_id, value) VALUES
      (1, 1, 1, '0W-20'),
      (2, 1, 2, '4.4'),
      (3, 5, 1, 'orphan: log is orphaned'),
      (4, 2, 77, 'orphan: field gone');
    INSERT INTO vehicle_service_interval_overrides (id, vehicle_id, service_type_id, override_interval_km, override_interval_days) VALUES
      (1, 1, 1, 10000, NULL),
      (2, 42, 1, 1, 1);
    INSERT INTO service_type_resets (parent_id, reset_id) VALUES (1, 2), (1, 99);
    INSERT INTO service_type_suggestions (parent_id, suggestion_id) VALUES (3, 1);
    INSERT INTO app_settings (key, value) VALUES ('gdrive_email', 'someone@example.invalid');
  `);
  db.close();
}

test(
  "v2 migrates a copy of a legacy database without losing reachable data",
  withTempDir(async (dir) => {
    const original = join(dir, "original.db");
    const copy = join(dir, "copy.db");
    await createLegacyDb(original);
    copyFileSync(original, copy);

    const db = openTestDb(copy);
    const ctx = testContext();
    assert.deepEqual(await migrate(db, ctx), { from: 0, to: LATEST_SCHEMA_VERSION });
    assert.equal(await getSchemaVersion(db), LATEST_SCHEMA_VERSION);

    const vehicles = await db.all<any>("SELECT * FROM vehicles ORDER BY id");
    assert.equal(vehicles.length, 2);
    assert.ok(vehicles.every((v) => isUuid(v.id) && v.device_id === ctx.deviceId && v.updated_at && v.deleted_at === null));
    assert.deepEqual(vehicles.map((v) => v.make), ["Toyota", "Honda"], "UUIDv7 ids keep the old order");
    const [toyota, honda] = vehicles;
    assert.equal(toyota.vin, "JTDBR32E720012345");
    assert.equal(toyota.acquisition_date, "2020-01-15");

    const oil = builtinServiceTypeId("oil-change");
    const types = await db.all<any>("SELECT id, slug, name FROM service_types ORDER BY name");
    assert.deepEqual(
      types.map((t) => [t.name, t.slug]),
      [["Detailing", null], ["Oil Change", "oil-change"], ["Oil Filter Replacement", "oil-filter-replacement"]],
    );
    assert.equal(types.find((t) => t.slug === "oil-change").id, oil);

    const logs = await db.all<any>(
      `SELECT l.notes, l.cost_cents, l.mileage, v.make, st.name AS st FROM maintenance_logs l
       JOIN vehicles v ON v.id = l.vehicle_id LEFT JOIN service_types st ON st.id = l.service_type_id ORDER BY l.date`,
    );
    assert.deepEqual(
      logs.map((l) => [l.make, l.st, l.notes]),
      [
        ["Toyota", "Oil Change", "synthetic"],
        ["Toyota", "Detailing", null],
        ["Honda", null, "misc"],
        ["Honda", null, "service type deleted while FKs were off"],
      ],
      "the log of a missing vehicle is dropped; a missing service type becomes NULL",
    );
    assert.equal(logs[0].cost_cents, 7950, "v5 turns 79.50 into 7950 cents");

    const values = await db.all<any>(
      `SELECT f.name, f.unit, f.required, f.default_value, f.archived_at, c.value FROM custom_field_values c
       JOIN custom_fields f ON f.id = c.field_id ORDER BY f.sort_order`,
    );
    assert.deepEqual(
      values.map((v) => [v.name, v.value, v.unit, v.required, v.default_value, v.archived_at]),
      [["Oil grade", "0W-20", null, 1, "5W-30", null], ["Quantity", "4.4", "L", 0, null, null]],
    );

    const overrides = await db.all<any>("SELECT * FROM vehicle_service_interval_overrides");
    assert.equal(overrides.length, 1);
    assert.equal(overrides[0].id, intervalOverrideId(toyota.id, oil));
    assert.equal(overrides[0].override_interval_km, 10000);

    assert.deepEqual(await db.all("SELECT parent_id, reset_id FROM service_type_resets"), [
      { parent_id: oil, reset_id: builtinServiceTypeId("oil-filter-replacement") },
    ]);
    assert.equal((await db.all("SELECT * FROM service_type_suggestions")).length, 1);
    assert.deepEqual(await db.all("SELECT * FROM app_settings"), [{ key: "gdrive_email", value: "someone@example.invalid" }]);

    assert.deepEqual(await db.all("PRAGMA foreign_key_check"), []);
    assert.deepEqual(await db.all("PRAGMA foreign_keys"), [{ foreign_keys: 1 }]);

    // Uniqueness only applies to live rows: a tombstoned vehicle frees its VIN.
    await db.run("UPDATE vehicles SET deleted_at = 'x' WHERE id = ?", [toyota.id]);
    await db.run(
      "INSERT INTO vehicles (id, make, model, vin, updated_at, device_id) VALUES ('v-new', 'Toyota', 'Corolla', 'JTDBR32E720012345', 'x', 'd')",
    );
    await assert.rejects(
      db.run("INSERT INTO vehicles (id, make, model, vin, updated_at, device_id) VALUES ('v-dup', 'A', 'B', 'JTDBR32E720012345', 'x', 'd')"),
    );
    assert.ok(honda.id);

    // Running again is a no-op.
    assert.deepEqual(await migrate(db, ctx), { from: LATEST_SCHEMA_VERSION, to: LATEST_SCHEMA_VERSION });
    db.close();

    const untouched = openTestDb(original);
    assert.equal(await getSchemaVersion(untouched), 0);
    assert.deepEqual(await untouched.all("SELECT id FROM vehicles ORDER BY id"), [{ id: 1 }, { id: 2 }]);
    untouched.close();
  }),
);

test(
  "a failing migration rolls back and leaves the database as it was",
  withTempDir(async (dir) => {
    const path = join(dir, "copy.db");
    await createLegacyDb(path);
    const db = openTestDb(path);
    // A view on a rebuilt table makes the RENAME step fail half-way through v2.
    await db.exec("CREATE VIEW recent_logs AS SELECT * FROM maintenance_logs WHERE vehicle_id = 1");

    await assert.rejects(migrate(db, testContext()));
    assert.equal(await getSchemaVersion(db), 1, "v1 committed, v2 rolled back");
    assert.deepEqual(await db.all("SELECT id, make FROM vehicles ORDER BY id"), [
      { id: 1, make: "Toyota" },
      { id: 2, make: "Honda" },
    ]);
    assert.equal((await db.all("SELECT * FROM maintenance_logs")).length, 5);
    assert.deepEqual(await db.all("PRAGMA foreign_keys"), [{ foreign_keys: 1 }]);
    db.close();
  }),
);

test("a fresh database migrates and seeds the built-ins once", async () => {
  const db = openTestDb();
  const ctx = testContext();
  assert.deepEqual(await migrate(db, ctx), { from: 0, to: LATEST_SCHEMA_VERSION });
  assert.equal(await seedBuiltinServiceTypes(db, ctx), BUILTIN_SERVICE_TYPES.length);
  assert.equal(await seedBuiltinServiceTypes(db, ctx), 0);

  const rows = await db.all<{ id: string; slug: string }>("SELECT id, slug FROM service_types");
  assert.equal(rows.length, BUILTIN_SERVICE_TYPES.length);
  assert.ok(rows.every((r) => r.id === builtinServiceTypeId(r.slug)));
  const [{ n }] = await db.all<{ n: number }>("SELECT COUNT(*) AS n FROM service_type_resets");
  assert.ok(n > 0);

  // "Restore defaults" brings back a deleted built-in and its links.
  const oil = builtinServiceTypeId("oil-change");
  await db.run("UPDATE service_types SET deleted_at = ? WHERE id = ?", [ctx.stamp(), oil]);
  await db.run("UPDATE service_type_resets SET deleted_at = ? WHERE parent_id = ?", [ctx.stamp(), oil]);
  assert.equal(await seedBuiltinServiceTypes(db, ctx), 0, "a deleted built-in stays deleted without force");
  assert.equal(await seedBuiltinServiceTypes(db, ctx, { force: true }), 1);
  assert.deepEqual(await db.all("SELECT deleted_at FROM service_type_resets WHERE parent_id = ?", [oil]), [{ deleted_at: null }]);
  db.close();
});

test(
  "v2 migrates copies of the desktop backend's databases",
  withTempDir(async (dir) => {
    const candidates = ["apps/desktop/car_baddie.db", "apps/backend/car_baddie.db"]
      .map((p) => join(REPO_ROOT, p))
      .filter(existsSync);
    for (const [i, source] of candidates.entries()) {
      const copy = join(dir, `desktop-${i}.db`);
      copyFileSync(source, copy);
      const db = openTestDb(copy);
      const count = async (table: string) => (await db.all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table}`))[0].n;
      const tables = ["vehicles", "service_types", "custom_fields", "maintenance_logs", "custom_field_values",
        "vehicle_service_interval_overrides", "service_type_resets", "service_type_suggestions"];
      const before = Object.fromEntries(await Promise.all(tables.map(async (t) => [t, await count(t)])));
      await migrate(db, testContext());
      const after = Object.fromEntries(await Promise.all(tables.map(async (t) => [t, await count(t)])));
      assert.deepEqual(after, before, `${source}: every row carried over`);
      const dropped = await db.all("SELECT name FROM sqlite_master WHERE name IN ('vehicle_definitions', 'alembic_version')");
      assert.deepEqual(dropped, [], "backend-only tables are dropped by v3");
      assert.deepEqual(await db.all("PRAGMA foreign_key_check"), []);
      db.close();
    }
  }),
);
