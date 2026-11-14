// Garage visits (service_events): a visit holds several maintenance logs as its items.
import { test } from "node:test";
import assert from "node:assert/strict";
import { parseBackup } from "../src/backup/format.ts";
import { migrate, MIGRATIONS } from "../src/db/migrations.ts";
import { openRepository } from "../src/db/open.ts";
import { SEED_STAMP } from "../src/db/seed.ts";
import { serviceEventId } from "../src/ids/uuid.ts";
import { builtinServiceTypeId } from "../src/service-types/builtin.ts";
import { SYNCED_TABLE_INFO } from "../src/sync/tables.ts";
import { ValidationError } from "../src/validation.ts";
import type { SyncTransport } from "../src/sync/transport.ts";
import { openTestDb, testContext, type TestDb } from "./helpers/sqlite.ts";

let wall = 1_780_000_000_000;
const clock = () => (wall += 7);

const OIL = builtinServiceTypeId("oil-change");
const FILTER = builtinServiceTypeId("oil-filter-replacement");
const TIRES = builtinServiceTypeId("tire-rotation");

async function device(): Promise<{ db: TestDb } & Awaited<ReturnType<typeof openRepository>>> {
  const db = openTestDb();
  return { db, ...(await openRepository(db, clock)) };
}

function memoryDrive(): SyncTransport {
  const files = new Map<string, { name: string; content: string }>();
  let next = 0;
  return {
    list: async () => [...files].map(([id, f]) => ({ id, name: f.name })),
    read: async (file) => JSON.parse(files.get(file.id)!.content),
    create: async (name, content) => {
      files.set(String(++next), { name, content: JSON.stringify(content) });
    },
    remove: async (file) => {
      files.delete(file.id);
    },
  };
}

async function liveState(db: TestDb) {
  const state: Record<string, unknown[]> = {};
  for (const { name, primaryKey } of SYNCED_TABLE_INFO) {
    const rows = await db.all<Record<string, unknown>>(`SELECT * FROM ${name} WHERE deleted_at IS NULL ORDER BY ${primaryKey.join(", ")}`);
    state[name] = rows.map(({ updated_at: _u, device_id: _d, ...rest }) => rest);
  }
  return state;
}

async function oilGradeField(repo: Awaited<ReturnType<typeof device>>["repo"]) {
  const fields = await repo.getCustomFieldsForServiceType(OIL);
  assert.ok(fields.length > 0, "the oil change built-in has default fields");
  return fields[0];
}

test("a visit is created, edited and deleted with its items and their values", async () => {
  const { db, repo } = await device();
  const v = await repo.createVehicle({ make: "Toyota", model: "Corolla" });
  const grade = await oilGradeField(repo);

  const visit = await repo.createServiceEvent(v.id, {
    date: "2025-06-01",
    mileage: 95000,
    shop: "  Joe's Garage ",
    notes: "Annual service",
    items: [
      { service_type_id: OIL, cost_cents: 5000, custom_field_values: [{ field_id: grade.id, value: "0W-20" }] },
      { service_type_id: FILTER, cost_cents: 1250, notes: "OEM filter" },
    ],
  });
  assert.equal(visit.shop, "Joe's Garage");
  assert.equal(visit.total_cost_cents, 6250);
  assert.deepEqual(visit.items.map((i) => [i.service_type_id, i.date, i.mileage, i.event_id]), [
    [OIL, "2025-06-01", 95000, visit.id],
    [FILTER, "2025-06-01", 95000, visit.id],
  ]);
  assert.equal(visit.items[0].custom_field_values[0].value, "0W-20");
  // Items are ordinary logs: the vehicle and the due-date engine still see them.
  assert.equal((await repo.getVehicleById(v.id))!.maintenance_logs.length, 2);

  // A standalone log is listed as a visit of its own, by date.
  const single = await repo.createMaintenanceLog(v.id, { date: "2025-07-01", mileage: 96000, cost_cents: 900, service_type_id: TIRES });
  const visits = await repo.getVisitsForVehicle(v.id);
  assert.deepEqual(visits.map((x) => [x.id, x.standalone ?? false, x.items.length, x.total_cost_cents]), [
    [single.id, true, 1, 900],
    [visit.id, false, 2, 6250],
  ]);
  assert.equal(single.event_id, null);

  // New header date/mileage applies to the items; items are matched by id, added or removed.
  const [oilItem, filterItem] = visit.items;
  const edited = await repo.updateServiceEvent(visit.id, {
    date: "2025-06-02",
    mileage: 95010,
    shop: "",
    items: [
      { id: oilItem.id, service_type_id: OIL, cost_cents: 5500, custom_field_values: [{ field_id: grade.id, value: "5W-30" }] },
      { service_type_id: TIRES, cost_cents: 0 },
    ],
  });
  assert.equal(edited.shop, null);
  assert.equal(edited.notes, "Annual service", "fields left out are kept");
  assert.deepEqual(edited.items.map((i) => [i.service_type_id, i.cost_cents, i.date, i.mileage]), [
    [OIL, 5500, "2025-06-02", 95010],
    [TIRES, 0, "2025-06-02", 95010],
  ]);
  assert.equal(edited.items[0].id, oilItem.id, "updated in place");
  assert.equal(edited.items[0].custom_field_values[0].value, "5W-30");
  assert.equal(await repo.getLogById(filterItem.id), null, "an item left out is deleted");

  // A header-only edit moves every item.
  const moved = await repo.updateServiceEvent(visit.id, { mileage: 95020 });
  assert.deepEqual(moved.items.map((i) => i.mileage), [95020, 95020]);

  await repo.deleteServiceEvent(visit.id);
  assert.equal(await repo.getServiceEvent(visit.id), null);
  assert.deepEqual((await repo.getVisitsForVehicle(v.id)).map((x) => x.id), [single.id]);
  const [{ n }] = await db.all<{ n: number }>(
    "SELECT COUNT(*) AS n FROM custom_field_values WHERE deleted_at IS NULL AND log_id = ?",
    [oilItem.id],
  );
  assert.equal(n, 0, "values of deleted items are tombstoned");

  // Deleting a visit's last item deletes the visit; deleting the vehicle deletes its visits.
  const two = await repo.createServiceEvent(v.id, { date: "2025-08-01", mileage: 97000, items: [{ service_type_id: OIL, cost_cents: 1 }] });
  await repo.deleteMaintenanceLog(two.items[0].id);
  assert.equal(await repo.getServiceEvent(two.id), null);
  const three = await repo.createServiceEvent(v.id, { date: "2025-09-01", mileage: 98000, items: [{ service_type_id: OIL, cost_cents: 1 }] });
  await repo.deleteVehicle(v.id);
  assert.equal(await repo.getServiceEvent(three.id), null);
});

test("visit edits are validated", async () => {
  const { repo } = await device();
  const v = await repo.createVehicle({ make: "Honda", model: "Civic" });
  await assert.rejects(repo.createServiceEvent(v.id, { date: "", mileage: -1, items: [] }), (e: unknown) => {
    assert.ok(e instanceof ValidationError);
    assert.deepEqual(Object.keys(e.fieldErrors).sort(), ["date", "items", "mileage"]);
    return true;
  });
  await assert.rejects(
    repo.createServiceEvent(v.id, { date: "2025-01-01", mileage: 1, items: [{ service_type_id: OIL, cost_cents: 1.5 }] }),
    (e: unknown) => e instanceof ValidationError && "items.0.cost_cents" in e.fieldErrors,
  );
  const visit = await repo.createServiceEvent(v.id, { date: "2025-01-01", mileage: 1, items: [{ service_type_id: OIL, cost_cents: 0 }] });
  await assert.rejects(repo.updateServiceEvent(visit.id, { items: [] }), ValidationError);
  assert.equal((await repo.updateServiceEvent(visit.id, { notes: "ok" })).notes, "ok", "partial updates only check given fields");
  await repo.deleteServiceEvent(visit.id);
  await assert.rejects(repo.updateServiceEvent(visit.id, { notes: "gone" }), /no longer exists/);
});

/** A database at schema v5 (before visits), with rows as if they had synced between devices. */
async function v5Database(deviceId: string) {
  const db = openTestDb();
  const ctx = testContext(deviceId);
  for (const m of MIGRATIONS) if (m.version <= 5) await m.up(db, ctx);
  await db.exec("PRAGMA user_version = 5");
  db.raw.exec(`
    INSERT INTO vehicles (id, make, model, updated_at, device_id) VALUES ('veh-1', 'Mazda', '3', 'hlc-v', 'dev-x');
    INSERT INTO maintenance_logs (id, vehicle_id, date, mileage, cost_cents, notes, updated_at, deleted_at, device_id) VALUES
      ('log-1', 'veh-1', '2025-03-01', 40000, 4000, 'oil', 'hlc-1', NULL, 'dev-x'),
      ('log-2', 'veh-1', '2025-03-01', 40000, 0, 'Co-performed with Oil Change', 'hlc-2', NULL, 'dev-x'),
      ('log-3', 'veh-1', '2025-03-01', 41000, 100, 'other odometer', 'hlc-3', NULL, 'dev-x'),
      ('log-4', 'veh-1', '2025-04-01', 42000, 100, 'deleted twin', 'hlc-4', 'hlc-4', 'dev-x'),
      ('log-5', 'veh-1', '2025-04-01', 42000, 100, 'alone', 'hlc-5', NULL, 'dev-x');
  `);
  return { db, ctx };
}

test("v7 groups logs sharing a date and odometer into one visit, identically on every device", async () => {
  const results = [];
  for (const deviceId of ["0190a0a0-0000-7000-8000-00000000000a", "0190a0a0-0000-7000-8000-00000000000b"]) {
    const { db, ctx } = await v5Database(deviceId);
    await migrate(db, ctx);
    const events = await db.all<Record<string, unknown>>("SELECT * FROM service_events");
    const logs = await db.all<Record<string, unknown>>("SELECT id, event_id, updated_at FROM maintenance_logs ORDER BY id");
    assert.deepEqual(await db.all("PRAGMA foreign_key_check"), []);
    results.push({ deviceId, events, logs });
    db.close();
  }

  const expectedId = serviceEventId("veh-1", "2025-03-01", 40000);
  for (const { deviceId, events, logs } of results) {
    assert.deepEqual(events, [
      { id: expectedId, vehicle_id: "veh-1", date: "2025-03-01", mileage: 40000, shop: null, notes: null,
        updated_at: SEED_STAMP, deleted_at: null, device_id: deviceId },
    ]);
    assert.deepEqual(logs, [
      { id: "log-1", event_id: expectedId, updated_at: "hlc-1" },
      { id: "log-2", event_id: expectedId, updated_at: "hlc-2" },
      { id: "log-3", event_id: null, updated_at: "hlc-3" },
      { id: "log-4", event_id: null, updated_at: "hlc-4" },
      { id: "log-5", event_id: null, updated_at: "hlc-5" },
    ], "only live logs are grouped, and they keep their updated_at");
  }
});

test("a visit syncs between devices, edits come back, and deletes cascade on both", async () => {
  const drive = memoryDrive();
  const a = await device();
  const b = await device();
  const v = await a.repo.createVehicle({ make: "Ford", model: "Focus" });
  const grade = await oilGradeField(a.repo);
  const visit = await a.repo.createServiceEvent(v.id, {
    date: "2025-05-01", mileage: 60000, shop: "Dealer",
    items: [
      { service_type_id: OIL, cost_cents: 7000, custom_field_values: [{ field_id: grade.id, value: "5W-30" }] },
      { service_type_id: FILTER, cost_cents: 1500 },
    ],
  });
  await a.sync(drive);
  await b.sync(drive);
  assert.deepEqual(await b.repo.getVisitsForVehicle(v.id), await a.repo.getVisitsForVehicle(v.id));

  await b.repo.updateServiceEvent(visit.id, {
    shop: "Dealer (warranty)",
    items: [{ id: visit.items[0].id, service_type_id: OIL, cost_cents: 0 }, { service_type_id: TIRES, cost_cents: 2000 }],
  });
  await b.sync(drive);
  await a.sync(drive);
  const onA = (await a.repo.getServiceEvent(visit.id))!;
  assert.equal(onA.shop, "Dealer (warranty)");
  assert.deepEqual(onA.items.map((i) => [i.service_type_id, i.cost_cents]), [[OIL, 0], [TIRES, 2000]]);
  assert.deepEqual(await liveState(a.db), await liveState(b.db));

  await a.repo.deleteServiceEvent(visit.id);
  await a.sync(drive);
  await b.sync(drive);
  assert.equal(await b.repo.getServiceEvent(visit.id), null);
  assert.deepEqual(await b.repo.getVisitsForVehicle(v.id), []);
  assert.deepEqual(await liveState(a.db), await liveState(b.db));

  // An item added on one device while the vehicle is deleted on the other ends up deleted too.
  const again = await a.repo.createServiceEvent(v.id, { date: "2025-06-01", mileage: 61000, items: [{ service_type_id: OIL, cost_cents: 1 }] });
  await a.sync(drive);
  await b.sync(drive);
  await b.repo.deleteVehicle(v.id);
  await a.repo.updateServiceEvent(again.id, {
    items: [{ id: again.items[0].id, service_type_id: OIL, cost_cents: 1 }, { service_type_id: FILTER, cost_cents: 2 }],
  });
  await b.sync(drive);
  await a.sync(drive);
  await b.sync(drive);
  for (const d of [a, b]) {
    assert.equal(await d.repo.getServiceEvent(again.id), null);
    const [{ n }] = await d.db.all<{ n: number }>("SELECT COUNT(*) AS n FROM maintenance_logs WHERE deleted_at IS NULL");
    assert.equal(n, 0);
  }
  assert.deepEqual(await liveState(a.db), await liveState(b.db));
});

test("a log pushed with a migrated visit brings the visit to a device that never had it", async () => {
  const drive = memoryDrive();
  const a = await device();
  const v = await a.repo.createVehicle({ make: "Kia", model: "Rio" });
  const l1 = await a.repo.createMaintenanceLog(v.id, { date: "2025-02-01", mileage: 1000, cost_cents: 100, service_type_id: OIL });
  const l2 = await a.repo.createMaintenanceLog(v.id, { date: "2025-02-01", mileage: 1000, cost_cents: 0, service_type_id: FILTER });
  await a.sync(drive);

  // What v7 does on a device that has already pushed these logs: a SEED_STAMP visit, logs untouched.
  const eventId = serviceEventId(v.id, "2025-02-01", 1000);
  await a.db.run(
    "INSERT INTO service_events (id, vehicle_id, date, mileage, updated_at, device_id) VALUES (?, ?, '2025-02-01', 1000, ?, ?)",
    [eventId, v.id, SEED_STAMP, a.deviceId],
  );
  await a.db.run("UPDATE maintenance_logs SET event_id = ? WHERE id IN (?, ?)", [eventId, l1.id, l2.id]);
  await a.repo.updateMaintenanceLog(l1.id, { notes: "edited after the upgrade" });
  await a.sync(drive);

  const fresh = await device();
  await fresh.sync(drive); // would fail on the foreign key if the visit weren't carried along
  assert.deepEqual((await fresh.repo.getServiceEvent(eventId))?.items.map((i) => i.id), [l1.id]);
});

test("merging two vehicles with the same VIN moves the visits to the survivor", async () => {
  const drive = memoryDrive();
  const a = await device();
  const b = await device();
  const vin = "1HGCM82633A004352";
  const va = await a.repo.createVehicle({ make: "Honda", model: "Accord", vin });
  const vb = await b.repo.createVehicle({ make: "Honda", model: "Accord", vin });
  const ea = await a.repo.createServiceEvent(va.id, { date: "2025-01-01", mileage: 10, items: [{ service_type_id: OIL, cost_cents: 1 }] });
  const eb = await b.repo.createServiceEvent(vb.id, { date: "2025-02-01", mileage: 20, items: [{ service_type_id: OIL, cost_cents: 2 }] });

  await a.sync(drive);
  await b.sync(drive);
  await a.sync(drive);
  await b.sync(drive);

  const keep = va.id < vb.id ? va.id : vb.id;
  for (const d of [a, b]) {
    const visits = await d.repo.getVisitsForVehicle(keep);
    assert.deepEqual(visits.map((x) => x.id), [eb.id, ea.id]);
    assert.ok(visits.every((x) => x.vehicle_id === keep && x.items.every((i) => i.vehicle_id === keep)));
  }
  assert.deepEqual(await liveState(a.db), await liveState(b.db));
});

test("visits survive a backup round trip, and older files import as standalone logs", async () => {
  const a = await device();
  const v = await a.repo.createVehicle({ make: "Toyota", model: "Yaris", vin: "JTDBR32E720012345" });
  const grade = await oilGradeField(a.repo);
  await a.repo.createServiceEvent(v.id, {
    date: "2025-06-01", mileage: 5000, shop: "Quick Lube", notes: "first service",
    items: [
      { service_type_id: OIL, cost_cents: 4000, custom_field_values: [{ field_id: grade.id, value: "0W-20" }] },
      { service_type_id: FILTER, cost_cents: 900 },
    ],
  });
  await a.repo.createMaintenanceLog(v.id, { date: "2025-07-01", mileage: 6000, cost_cents: 300, service_type_id: TIRES });

  const file = parseBackup(JSON.parse(JSON.stringify(await a.repo.exportBackup({}))));
  assert.equal(file.vehicles[0].service_events?.length, 1);
  assert.ok(!JSON.stringify(file).includes(v.id), "no local UUIDs leak into the file");

  const b = await device();
  await b.repo.importBackup(file, { vehicles_to_add: [file.vehicles[0].id], conflict_resolutions: [] });
  const [imported] = await b.repo.getAllVehicles();
  const visits = await b.repo.getVisitsForVehicle(imported.id);
  assert.deepEqual(
    visits.map((x) => [x.date, x.shop, x.notes, x.standalone ?? false, x.items.map((i) => [i.service_type_id, i.cost_cents])]),
    [
      ["2025-07-01", null, null, true, [[TIRES, 300]]],
      ["2025-06-01", "Quick Lube", "first service", false, [[OIL, 4000], [FILTER, 900]]],
    ],
  );
  assert.notEqual(visits[1].id, (await a.repo.getVisitsForVehicle(v.id))[1].id, "importers create fresh ids");
  assert.equal(visits[1].items[0].custom_field_values[0].value, "0W-20");

  // The same file without visit data (as older versions wrote it): every log is standalone.
  const old = structuredClone(file);
  for (const veh of old.vehicles) {
    delete veh.service_events;
    for (const log of veh.maintenance_logs) delete log.event_id;
  }
  const c = await device();
  await c.repo.importBackup(parseBackup(old), { vehicles_to_add: [old.vehicles[0].id], conflict_resolutions: [] });
  const [cv] = await c.repo.getAllVehicles();
  assert.deepEqual((await c.repo.getVisitsForVehicle(cv.id)).map((x) => x.standalone), [true, true, true]);
});
