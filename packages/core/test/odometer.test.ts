import { test } from "node:test";
import assert from "node:assert/strict";
import { getSchemaVersion, LATEST_SCHEMA_VERSION, migrate, MIGRATIONS } from "../src/db/migrations.ts";
import { openRepository } from "../src/db/open.ts";
import { createRepository } from "../src/db/repository.ts";
import { parseBackup } from "../src/backup/format.ts";
import { ValidationError } from "../src/validation.ts";
import { openTestDb, testContext } from "./helpers/sqlite.ts";

let wall = 1_765_000_000_000;
const clock = () => wall++;

async function freshRepo() {
  const db = openTestDb();
  const opened = await openRepository(db, clock);
  return { db, ...opened };
}

test("odometer readings can be added, edited, listed newest first and deleted", async () => {
  const { db, repo } = await freshRepo();
  const v = await repo.createVehicle({ make: "Skoda", model: "Octavia" });

  const first = await repo.addOdometerReading(v.id, { date: "2025-03-01", mileage: 41000, note: "  before the trip " });
  assert.deepEqual(first, { id: first.id, vehicle_id: v.id, date: "2025-03-01", mileage: 41000, note: "before the trip" });
  const second = await repo.addOdometerReading(v.id, { date: "2025-05-01", mileage: 44000 });
  const sameDay = await repo.addOdometerReading(v.id, { date: "2025-05-01", mileage: 44500, note: "" });
  assert.equal(sameDay.note, null);
  assert.deepEqual((await repo.getOdometerReadings(v.id)).map((r) => r.id), [sameDay.id, second.id, first.id]);

  const edited = await repo.updateOdometerReading(first.id, { mileage: 41200, note: null });
  assert.deepEqual([edited.mileage, edited.note, edited.date], [41200, null, "2025-03-01"]);

  await repo.deleteOdometerReading(second.id);
  assert.deepEqual((await repo.getOdometerReadings(v.id)).map((r) => r.id), [sameDay.id, first.id]);
  const [row] = await db.all<{ deleted_at: string | null }>("SELECT deleted_at FROM odometer_readings WHERE id = ?", [second.id]);
  assert.notEqual(row.deleted_at, null, "deletes are tombstones");
});

test("odometer readings are validated", async () => {
  const { repo } = await freshRepo();
  const v = await repo.createVehicle({ make: "Skoda", model: "Octavia" });
  const fieldsOf = async (p: Promise<unknown>) => {
    try {
      await p;
    } catch (error) {
      assert.ok(error instanceof ValidationError);
      return Object.keys(error.fieldErrors).sort();
    }
    assert.fail("expected a ValidationError");
  };
  assert.deepEqual(await fieldsOf(repo.addOdometerReading(v.id, { date: " ", mileage: -1 })), ["date", "mileage"]);
  assert.deepEqual(await fieldsOf(repo.addOdometerReading(v.id, { date: "2025-01-01", mileage: 1.5 })), ["mileage"]);
  assert.deepEqual(await fieldsOf(repo.addOdometerReading(v.id, { date: "2025-01-01" } as never)), ["mileage"]);
  const r = await repo.addOdometerReading(v.id, { date: "2025-01-01", mileage: 0 });
  assert.deepEqual(await fieldsOf(repo.updateOdometerReading(r.id, { date: "" })), ["date"]);
  assert.deepEqual(await fieldsOf(repo.updateOdometerReading(r.id, { mileage: null as never })), ["mileage"]);
  assert.equal((await repo.getOdometerReadings(v.id)).length, 1);
});

test("current_mileage is the highest of initial mileage, logs and readings", async () => {
  const { repo } = await freshRepo();
  const bare = await repo.createVehicle({ make: "Fiat", model: "Panda" });
  assert.equal(bare.current_mileage, null);
  assert.deepEqual(bare.odometer_readings, []);

  const v = await repo.createVehicle({ make: "Fiat", model: "500", initial_mileage: 20000 });
  assert.equal(v.current_mileage, 20000);
  await repo.createMaintenanceLog(v.id, { date: "2025-01-01", mileage: 25000, cost_cents: 0 });
  assert.equal((await repo.getVehicleById(v.id))?.current_mileage, 25000);
  const reading = await repo.addOdometerReading(v.id, { date: "2025-06-01", mileage: 31000 });
  assert.equal((await repo.getVehicleById(v.id))?.current_mileage, 31000);
  // A newer but lower reading (a typo, say) doesn't lower it.
  await repo.addOdometerReading(v.id, { date: "2025-07-01", mileage: 3000 });
  assert.equal((await repo.getVehicleById(v.id))?.current_mileage, 31000);
  await repo.deleteOdometerReading(reading.id);
  const after = await repo.getVehicleById(v.id);
  assert.equal(after?.current_mileage, 25000);
  assert.equal(after?.odometer_readings.length, 1);
});

test("deleting a vehicle tombstones its odometer readings", async () => {
  const { db, repo } = await freshRepo();
  const v = await repo.createVehicle({ make: "Seat", model: "Leon" });
  const r = await repo.addOdometerReading(v.id, { date: "2025-01-01", mileage: 1000 });
  await repo.deleteVehicle(v.id);
  const [row] = await db.all<{ deleted_at: string | null }>("SELECT deleted_at FROM odometer_readings WHERE id = ?", [r.id]);
  assert.notEqual(row.deleted_at, null);
  assert.deepEqual(await repo.getOdometerReadings(v.id), []);
});

test("odometer readings survive a backup round trip", async () => {
  const source = await freshRepo();
  const v = await source.repo.createVehicle({ make: "Volvo", model: "V70", vin: "YV1SW61R021234567" });
  await source.repo.addOdometerReading(v.id, { date: "2025-02-01", mileage: 150000, note: "MOT" });
  await source.repo.addOdometerReading(v.id, { date: "2025-08-01", mileage: 158000 });

  const file = parseBackup(JSON.parse(JSON.stringify(await source.repo.exportBackup({}))));
  assert.equal(file.vehicles[0].odometer_readings.length, 2);
  const noHistory = await source.repo.exportBackup({ include_maintenance_logs: false });
  assert.deepEqual(noHistory.vehicles[0].odometer_readings, []);
  const ranged = await source.repo.exportBackup({ start_date: "2025-06-01" });
  assert.deepEqual(ranged.vehicles[0].odometer_readings.map((r) => r.mileage), [158000]);

  const target = await freshRepo();
  await target.repo.importBackup(file, { vehicles_to_add: [file.vehicles[0].id], conflict_resolutions: [] });
  const [imported] = await target.repo.getAllVehicles();
  assert.notEqual(imported.id, v.id, "imports get fresh ids");
  assert.deepEqual(
    imported.odometer_readings.map((r) => [r.date, r.mileage, r.note]),
    [["2025-08-01", 158000, null], ["2025-02-01", 150000, "MOT"]],
  );
  assert.equal(imported.current_mileage, 158000);
});

test("v6 adds odometer_readings to a v5 database", async () => {
  const db = openTestDb();
  const ctx = testContext();
  for (const m of MIGRATIONS.filter((m) => m.version <= 5)) await m.up(db, ctx);
  await db.exec("PRAGMA user_version = 5");
  await db.run(
    `INSERT INTO vehicles (id, make, model, initial_mileage, updated_at, deleted_at, device_id)
     VALUES ('veh-1', 'Opel', 'Astra', 5000, ?, NULL, ?)`,
    [ctx.stamp(), ctx.deviceId],
  );

  assert.deepEqual(await migrate(db, ctx), { from: 5, to: LATEST_SCHEMA_VERSION });
  assert.equal(await getSchemaVersion(db), LATEST_SCHEMA_VERSION);
  const repo = createRepository(db, ctx);
  const before = await repo.getVehicleById("veh-1");
  assert.deepEqual([before?.odometer_readings, before?.current_mileage], [[], 5000]);
  await repo.addOdometerReading("veh-1", { date: "2025-01-01", mileage: 9000 });
  assert.equal((await repo.getVehicleById("veh-1"))?.current_mileage, 9000);
  await assert.rejects(repo.addOdometerReading("missing", { date: "2025-01-01", mileage: 1 }), "readings need a vehicle");
  db.close();
});
