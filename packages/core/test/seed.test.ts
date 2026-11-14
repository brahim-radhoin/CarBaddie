import { test } from "node:test";
import assert from "node:assert/strict";
import { openRepository } from "../src/db/open.ts";
import { migrate } from "../src/db/migrations.ts";
import { mergeLegacyServiceTypes } from "../src/db/legacy.ts";
import { seedBuiltinServiceTypes } from "../src/db/seed.ts";
import { BUILTIN_SERVICE_TYPES, builtinFieldId, builtinServiceTypeId } from "../src/service-types/builtin.ts";
import type { SyncTransport } from "../src/sync/transport.ts";
import { openTestDb, testContext, type TestDb } from "./helpers/sqlite.ts";

let wall = 1_780_000_000_000;
const clock = () => (wall += 5);

async function device() {
  const db = openTestDb();
  return { db, ...(await openRepository(db, clock)) };
}

function memoryDrive(): SyncTransport {
  const files = new Map<string, { name: string; content: string }>();
  let n = 0;
  return {
    list: async () => [...files].map(([id, f]) => ({ id, name: f.name })),
    read: async (f) => JSON.parse(files.get(f.id)!.content),
    create: async (name, c) => void files.set(String(++n), { name, content: JSON.stringify(c) }),
    remove: async (f) => void files.delete(f.id),
  };
}

const liveRows = (db: TestDb, table: string, cols: string) =>
  db.all(`SELECT ${cols} FROM ${table} WHERE deleted_at IS NULL ORDER BY 1, 2`);

test("every device seeds the same built-ins and default fields, and syncing them changes nothing", async () => {
  const a = await device();
  const b = await device();
  for (const [table, cols] of [
    ["service_types", "id, slug, name, recommended_interval_km, recommended_interval_days"],
    ["custom_fields", "id, service_type_id, name, field_type, unit, sort_order"],
    ["service_type_resets", "parent_id, reset_id"],
  ] as const) {
    assert.deepEqual(await liveRows(a.db, table, cols), await liveRows(b.db, table, cols), table);
  }
  const oil = await a.repo.getServiceTypeById(builtinServiceTypeId("oil-change"));
  assert.deepEqual(oil?.fields.map((f) => f.id), ["oil-brand", "oil-viscosity", "oil-amount", "drain-plug-washer"].map(
    (k) => builtinFieldId("oil-change", k),
  ));

  const drive = memoryDrive();
  await a.sync(drive);
  const pulled = await b.sync(drive);
  assert.equal(pulled.applied, 0, "identical seeds: nothing to apply");
  const names = (await b.db.all<{ name: string }>("SELECT name FROM custom_fields UNION ALL SELECT name FROM service_types"))
    .map((r) => r.name);
  assert.ok(!names.some((n) => / \(2\)$/.test(n)), "no renamed duplicates");
});

test("seeding adds missing built-ins to a database that already has service types, never deleted ones", async () => {
  const db = openTestDb();
  const ctx = testContext();
  await migrate(db, ctx);
  await db.run(
    "INSERT INTO service_types (id, slug, name, updated_at, deleted_at, device_id) VALUES ('custom-1', NULL, 'My Type', ?, NULL, ?)",
    [ctx.stamp(), ctx.deviceId],
  );
  assert.equal(await seedBuiltinServiceTypes(db, ctx), BUILTIN_SERVICE_TYPES.length);

  const headlight = builtinServiceTypeId("headlight-bulb-replacement");
  await db.run("UPDATE service_types SET deleted_at = ?, updated_at = ? WHERE id = ?", [ctx.stamp(), ctx.stamp(), headlight]);
  assert.equal(await seedBuiltinServiceTypes(db, ctx), 0);
  assert.deepEqual(await db.all("SELECT 1 FROM service_types WHERE id = ? AND deleted_at IS NULL", [headlight]), []);
});

test("a fresh device's seed doesn't bring back a built-in deleted on another device", async () => {
  const drive = memoryDrive();
  const a = await device();
  const headlight = builtinServiceTypeId("headlight-bulb-replacement");
  await a.repo.deleteServiceType(headlight);
  await a.sync(drive);

  const b = await device(); // seeds headlight again, with the seed stamp
  await b.sync(drive);
  await a.sync(drive);
  for (const d of [a, b]) assert.equal(await d.repo.getServiceTypeById(headlight), null);
});

test("an existing field with a default field's name moves to the built-in id with its values", async () => {
  const { db, repo } = await device();
  const ctx = testContext("0190a0a0-0000-7000-8000-0000000000ff", wall + 1_000_000);
  const cabin = builtinServiceTypeId("cabin-air-filter-replacement");
  const fixedId = builtinFieldId("cabin-air-filter-replacement", "filter-brand");
  // As on a desktop from before built-ins had fields: the field exists under a random id.
  await db.run("DELETE FROM custom_fields WHERE id = ?", [fixedId]);
  await db.run(
    `INSERT INTO custom_fields (id, service_type_id, name, field_type, sort_order, updated_at, deleted_at, device_id)
     VALUES ('old-field', ?, 'filter brand', 'text', 0, ?, NULL, ?)`,
    [cabin, ctx.stamp(), ctx.deviceId],
  );
  const v = await repo.createVehicle({ make: "VW", model: "Golf" });
  const log = await repo.createMaintenanceLog(v.id, {
    date: "2025-01-01", mileage: 1, cost: 0, service_type_id: cabin,
    custom_field_values: [{ field_id: "old-field", value: "Mann" }],
  });

  await seedBuiltinServiceTypes(db, ctx);
  const after = await repo.getLogById(log.id);
  assert.equal(after?.custom_field_values[0].field_id, fixedId);
  assert.equal(after?.custom_field_values[0].value, "Mann");
  assert.deepEqual(await db.all("SELECT deleted_at IS NOT NULL AS gone FROM custom_fields WHERE id = 'old-field'"), [{ gone: 1 }]);
});

test("legacy desktop service types merge into their built-ins", async () => {
  const { db, repo, deviceId } = await device();
  const ctx = testContext(deviceId, wall + 2_000_000);
  const legacy = await repo.createServiceType({
    name: "Engine Oil and Filter Change",
    recommended_interval_km: 6000,
    fields: [
      { name: "Oil Brand", field_type: "text" },
      { name: "Filter Used", field_type: "text" },
    ],
  });
  const unusedPads = await repo.createServiceType({ name: "Brake Pad Replacement", fields: [{ name: "Position", field_type: "text" }] });
  const v = await repo.createVehicle({ make: "Opel", model: "Astra" });
  const log = await repo.createMaintenanceLog(v.id, {
    date: "2025-02-01", mileage: 1000, cost: 40, service_type_id: legacy.id,
    custom_field_values: legacy.fields.map((f) => ({ field_id: f.id, value: f.name === "Oil Brand" ? "Total" : "Bosch" })),
  });
  await repo.upsertIntervalOverride(v.id, legacy.id, { override_interval_km: 5000 });

  assert.equal(await mergeLegacyServiceTypes(db, ctx), 2);

  const oilId = builtinServiceTypeId("oil-change");
  const oil = (await repo.getServiceTypeById(oilId))!;
  assert.equal(oil.recommended_interval_km, 6000, "the user's interval wins");
  assert.equal(oil.recommended_interval_days, 180, "the built-in keeps what the user didn't set");
  assert.ok(oil.fields.some((f) => f.name === "Filter Used"), "a field the built-in lacks moves over");
  assert.equal(oil.fields.filter((f) => f.name === "Oil Brand").length, 1);

  const merged = (await repo.getLogById(log.id))!;
  assert.equal(merged.service_type_id, oilId);
  const values = Object.fromEntries(merged.custom_field_values.map((cfv) => [cfv.custom_field.name, [cfv.field_id, cfv.value]]));
  assert.deepEqual(values["Oil Brand"], [builtinFieldId("oil-change", "oil-brand"), "Total"]);
  assert.equal(values["Filter Used"][1], "Bosch");

  const overrides = await repo.getOverridesForVehicle(v.id);
  assert.deepEqual(overrides.map((o) => [o.service_type_id, o.override_interval_km]), [[oilId, 5000]]);
  assert.equal(await repo.getServiceTypeById(legacy.id), null);
  assert.equal(await repo.getServiceTypeById(unusedPads.id), null, "unused legacy type without a built-in is deleted");
  assert.equal(await mergeLegacyServiceTypes(db, ctx), 0, "nothing left to merge");
});

test("a legacy type that is still used and has no built-in to go to is kept", async () => {
  const { db, repo, deviceId } = await device();
  const pads = await repo.createServiceType({ name: "Brake Pad Replacement", fields: [] });
  const v = await repo.createVehicle({ make: "Fiat", model: "Punto" });
  await repo.createMaintenanceLog(v.id, { date: "2025-03-01", mileage: 1, cost: 0, service_type_id: pads.id });
  assert.equal(await mergeLegacyServiceTypes(db, testContext(deviceId, wall + 3_000_000)), 0);
  assert.equal((await repo.getServiceTypeById(pads.id))?.name, "Brake Pad Replacement");
});
