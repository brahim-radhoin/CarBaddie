import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBackup } from "../src/backup/format.ts";
import { openRepository } from "../src/db/open.ts";
import { ValidationError } from "../src/validation.ts";
import { builtinServiceTypeId, BUILTIN_SERVICE_TYPES } from "../src/service-types/builtin.ts";
import { openTestDb } from "./helpers/sqlite.ts";

let wall = 1_760_000_000_000;
const clock = () => wall++;

async function freshRepo() {
  const db = openTestDb();
  const opened = await openRepository(db, clock);
  return { db, ...opened };
}

test("opening a fresh database migrates, seeds and keeps its device id", async () => {
  const db = openTestDb();
  const first = await openRepository(db, clock);
  assert.equal((await first.repo.getAllServiceTypes()).length, BUILTIN_SERVICE_TYPES.length);
  const again = await openRepository(db, clock);
  assert.equal(again.deviceId, first.deviceId);
  assert.deepEqual(again.migrated.from, again.migrated.to);
  assert.equal((await again.repo.getAllServiceTypes()).length, BUILTIN_SERVICE_TYPES.length);
});

test("editing a service type archives removed fields and keeps their values", async () => {
  const { repo } = await freshRepo();
  const st = await repo.createServiceType({
    name: "Detailing",
    fields: [
      { name: "Wax", field_type: "text" },
      { name: "Hours", field_type: "number", unit: "h" },
    ],
  });
  const [wax, hours] = st.fields;
  const v = await repo.createVehicle({ make: "Toyota", model: "Corolla", vin: " JTDBR32E720012345 " });
  assert.equal(v.vin, "JTDBR32E720012345");
  const log = await repo.createMaintenanceLog(v.id, {
    date: "2025-06-01",
    mileage: 1000,
    cost_cents: 5000,
    service_type_id: st.id,
    custom_field_values: [
      { field_id: wax.id, value: "Carnauba" },
      { field_id: hours.id, value: "2" },
    ],
  });

  // Rename Hours (matched by id), drop Wax, add Brand.
  const edited = await repo.updateServiceType(st.id, {
    fields: [
      { id: hours.id, name: "Duration", field_type: "number", unit: "h" },
      { name: "Brand", field_type: "text" },
    ],
  });
  assert.deepEqual(edited.fields.map((f) => f.name), ["Duration", "Brand"]);
  assert.equal(edited.fields[0].id, hours.id, "renamed in place");

  // A log edit only sends the current fields; the archived Wax value survives.
  await repo.updateMaintenanceLog(log.id, { custom_field_values: [{ field_id: hours.id, value: "3" }] });
  const reread = (await repo.getLogById(log.id))!;
  assert.deepEqual(
    reread.custom_field_values.map((c) => [c.custom_field.name, c.value, !!c.custom_field.archived]),
    [["Duration", "3", false], ["Wax", "Carnauba", true]],
  );

  // Changing a field's type archives the old field instead of reinterpreting its values.
  const retyped = await repo.updateServiceType(st.id, {
    fields: [{ id: hours.id, name: "Duration", field_type: "text" }],
  });
  assert.notEqual(retyped.fields[0].id, hours.id);
  const values = (await repo.getLogById(log.id))!.custom_field_values;
  assert.ok(values.some((c) => c.field_id === hours.id && c.value === "3" && c.custom_field.archived));

  // Backups carry archived fields so a restore keeps the values.
  const backup = await repo.exportBackup({});
  const exported = backup.service_types.find((s) => s.name === "Detailing")!;
  assert.deepEqual(exported.fields.map((f) => [f.name, !!f.archived]).sort(), [
    ["Brand", true], ["Duration", false], ["Duration", true], ["Wax", true],
  ]);
});

test("deletes are tombstones that cascade like the old foreign keys", async () => {
  const { db, repo } = await freshRepo();
  const oil = builtinServiceTypeId("oil-change");
  const v = await repo.createVehicle({ make: "Honda", model: "Civic" });
  const log = await repo.createMaintenanceLog(v.id, { date: "2025-01-01", mileage: 5, cost_cents: 100, service_type_id: oil });
  await repo.upsertIntervalOverride(v.id, oil, { override_interval_km: 5000 });

  await repo.deleteServiceType(oil);
  assert.equal(await repo.getServiceTypeById(oil), null);
  assert.equal((await repo.getLogById(log.id))!.service_type_id, null, "logs keep their record, like SET NULL");
  assert.deepEqual((await repo.getVehicleById(v.id))!.interval_overrides, []);
  assert.deepEqual(await db.all("SELECT COUNT(*) AS n FROM service_types WHERE id = ?", [oil]), [{ n: 1 }], "row is kept");

  await repo.deleteVehicle(v.id);
  assert.equal(await repo.getVehicleById(v.id), null);
  assert.equal(await repo.getLogById(log.id), null);
  const [{ n }] = await db.all<{ n: number }>("SELECT COUNT(*) AS n FROM maintenance_logs WHERE deleted_at IS NOT NULL");
  assert.equal(n, 1);

  // A deleted built-in comes back with "load defaults", and an override can be set again.
  assert.equal(await repo.restoreDefaultServiceTypes(), 1);
  const v2 = await repo.createVehicle({ make: "Honda", model: "Civic" });
  const ov = await repo.upsertIntervalOverride(v2.id, oil, { override_interval_days: 90 });
  assert.equal(ov.override_interval_days, 90);
});

test("a failed write rolls back everything in its transaction", async () => {
  const { repo } = await freshRepo();
  await repo.createServiceType({ name: "Custom", fields: [] });
  const before = await repo.getAllServiceTypes();
  // The second vehicle breaks the unique-VIN rule after the service type and first vehicle were written.
  const vin = "JTDBR32E720012345";
  await assert.rejects(
    repo.importBackup(
      parseBackup({
        metadata: { export_date_utc: "x" },
        service_types: [{ id: 1, name: "Brand new" }],
        vehicles: [{ id: 1, make: "A", model: "B", vin }, { id: 2, make: "C", model: "D", vin }],
      }),
      { vehicles_to_add: [1, 2], conflict_resolutions: [] },
    ),
  );
  assert.deepEqual(await repo.getAllServiceTypes(), before);
  assert.deepEqual(await repo.getAllVehicles(), []);
  // The queue keeps working after a failed transaction.
  assert.equal((await repo.createVehicle({ make: "E", model: "F", vin })).vin, vin);
});

test("a backup exported by one device imports into another", async () => {
  const a = await freshRepo();
  const v = await a.repo.createVehicle({ make: "Toyota", model: "Corolla", vin: "JTDBR32E720012345", initial_mileage: 100 });
  const oil = builtinServiceTypeId("oil-change");
  await a.repo.createMaintenanceLog(v.id, { date: "2025-06-01", mileage: 900, cost_cents: 7950, service_type_id: oil });
  await a.repo.upsertIntervalOverride(v.id, oil, { override_interval_km: 10000 });
  const custom = await a.repo.createServiceType({ name: "Detailing", fields: [{ name: "Wax", field_type: "text" }] });
  await a.repo.createMaintenanceLog(v.id, {
    date: "2025-07-01", mileage: 950, cost_cents: 4000, service_type_id: custom.id,
    custom_field_values: [{ field_id: custom.fields[0].id, value: "Carnauba" }],
  });

  const file = parseBackup(JSON.parse(JSON.stringify(await a.repo.exportBackup({}))));

  const b = await freshRepo();
  const analysis = await b.repo.analyzeBackup(file);
  assert.equal(analysis.new_vehicles.length, 1);
  await b.repo.importBackup(file, { vehicles_to_add: [analysis.new_vehicles[0].id_in_backup], conflict_resolutions: [] });

  const [imported] = await b.repo.getAllVehicles();
  assert.notEqual(imported.id, v.id, "importers create fresh local ids");
  assert.equal(imported.vin, "JTDBR32E720012345");
  assert.deepEqual(imported.maintenance_logs.map((l) => [l.date, l.service_type?.name, l.custom_field_values[0]?.value]), [
    ["2025-07-01", "Detailing", "Carnauba"],
    ["2025-06-01", "Oil Change", undefined],
  ]);
  assert.equal(imported.maintenance_logs[1].service_type_id, oil, "built-ins map to the same id on every device");
  assert.equal(imported.interval_overrides[0].override_interval_km, 10000);

  // Importing the same file again finds the VIN conflict; "replace" swaps in the backup copy.
  const again = await b.repo.analyzeBackup(file);
  assert.equal(again.conflicting_vehicles.length, 1);
  await b.repo.importBackup(file, { vehicles_to_add: [], conflict_resolutions: [{ vin: "JTDBR32E720012345", action: "replace" }] });
  const after = await b.repo.getAllVehicles();
  assert.equal(after.length, 1);
  assert.notEqual(after[0].id, imported.id);
});

test("user edits are validated like the old backend did", async () => {
  const { repo } = await freshRepo();
  await assert.rejects(repo.createVehicle({ make: "", model: "X", vin: "BAD", initial_mileage: -1 }), (e: unknown) => {
    assert.ok(e instanceof ValidationError);
    assert.deepEqual(Object.keys(e.fieldErrors).sort(), ["initial_mileage", "make", "vin"]);
    return true;
  });
  const v = await repo.createVehicle({ make: "Toyota", model: "Corolla", vin: " jtdbr32e720012345 " });
  assert.equal(v.vin, "JTDBR32E720012345", "VINs are stored upper-case");
  await assert.rejects(repo.updateVehicle(v.id, { vin: "JTDBR32E72001234O" }), ValidationError);
  assert.equal((await repo.updateVehicle(v.id, { model: "Auris" })).model, "Auris", "partial updates only check given fields");
  await assert.rejects(repo.createServiceType({ name: "X", fields: [], recommended_interval_km: -5 }), ValidationError);
  await assert.rejects(repo.upsertIntervalOverride(v.id, builtinServiceTypeId("oil-change"), { override_interval_days: 1.5 }), ValidationError);
});
