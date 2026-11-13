import { test } from "node:test";
import assert from "node:assert/strict";
import { openRepository } from "../src/db/open.ts";
import { LATEST_SCHEMA_VERSION } from "../src/db/migrations.ts";
import { parseSyncFileName, syncFileName } from "../src/sync/files.ts";
import { SYNCED_TABLE_INFO } from "../src/sync/tables.ts";
import type { SyncTransport } from "../src/sync/transport.ts";
import { openTestDb, type TestDb } from "./helpers/sqlite.ts";

let wall = 1_770_000_000_000;
const clock = () => (wall += 7);

/** One shared "Drive" folder. */
function memoryDrive() {
  const files = new Map<string, { name: string; content: string }>();
  let next = 0;
  const transport: SyncTransport = {
    list: async () => [...files].map(([id, f]) => ({ id, name: f.name })),
    read: async (file) => {
      const f = files.get(file.id);
      if (!f) throw new Error(`404 ${file.name}`);
      return JSON.parse(f.content);
    },
    create: async (name, content) => {
      files.set(String(++next), { name, content: JSON.stringify(content) });
    },
    remove: async (file) => {
      files.delete(file.id);
    },
  };
  return { transport, names: () => [...files.values()].map((f) => f.name).sort() };
}

async function device(): Promise<{ db: TestDb } & Awaited<ReturnType<typeof openRepository>>> {
  const db = openTestDb();
  return { db, ...(await openRepository(db, clock)) };
}

/** Live rows of every synced table without sync bookkeeping, for comparing devices. */
async function liveState(db: TestDb) {
  const state: Record<string, unknown[]> = {};
  for (const { name, primaryKey } of SYNCED_TABLE_INFO) {
    const rows = await db.all<Record<string, unknown>>(
      `SELECT * FROM ${name} WHERE deleted_at IS NULL ORDER BY ${primaryKey.join(", ")}`,
    );
    state[name] = rows.map(({ updated_at: _u, device_id: _d, ...rest }) => rest);
  }
  return state;
}

test("changes made on one device reach another, and edits come back", async () => {
  const drive = memoryDrive();
  const a = await device();
  const b = await device();

  const v = await a.repo.createVehicle({ make: "Toyota", model: "Corolla", year: 2015, vin: "JTDBR32E720012345" });
  const [oil] = (await a.repo.getAllServiceTypes()).filter((st) => st.slug === "oil-change");
  const log = await a.repo.createMaintenanceLog(v.id, { date: "2025-01-10", mileage: 100000, cost: 60, service_type_id: oil.id });

  const pushed = await a.sync(drive.transport);
  assert.equal(pushed.downloaded, 0);
  assert.ok(pushed.uploaded > 0);

  const pulled = await b.sync(drive.transport);
  assert.equal(pulled.downloaded, 1);
  const onB = await b.repo.getVehicleById(v.id);
  assert.equal(onB?.maintenance_logs[0]?.id, log.id);

  await b.repo.updateMaintenanceLog(log.id, { cost: 75 });
  await b.sync(drive.transport);
  await a.sync(drive.transport);
  assert.equal((await a.repo.getLogById(log.id))?.cost, 75);
  assert.deepEqual(await liveState(a.db), await liveState(b.db));

  // Nothing new: nothing moves.
  const idle = await a.sync(drive.transport);
  assert.deepEqual(idle, { downloaded: 0, applied: 0, uploaded: 0, compacted: false });
});

test("the newer of two concurrent edits wins on both devices", async () => {
  const drive = memoryDrive();
  const a = await device();
  const b = await device();
  const v = await a.repo.createVehicle({ make: "Honda", model: "Civic" });
  await a.sync(drive.transport);
  await b.sync(drive.transport);

  await a.repo.updateVehicle(v.id, { model: "Civic Si" });
  await b.repo.updateVehicle(v.id, { model: "Civic Type R" }); // later
  await a.sync(drive.transport);
  await b.sync(drive.transport);
  await a.sync(drive.transport);

  assert.equal((await a.repo.getVehicleById(v.id))?.model, "Civic Type R");
  assert.deepEqual(await liveState(a.db), await liveState(b.db));
});

test("the same VIN added on two devices becomes one vehicle with both histories", async () => {
  const drive = memoryDrive();
  const a = await device();
  const b = await device();
  const vin = "1HGCM82633A004352";
  const va = await a.repo.createVehicle({ make: "Honda", model: "Accord", vin });
  const vb = await b.repo.createVehicle({ make: "Honda", model: "Accord", vin: vin.toLowerCase() });
  const [tires] = (await a.repo.getAllServiceTypes()).filter((st) => st.slug === "tire-rotation");
  const la = await a.repo.createMaintenanceLog(va.id, { date: "2025-02-01", mileage: 50000, cost: 20 });
  const lb = await b.repo.createMaintenanceLog(vb.id, { date: "2025-03-01", mileage: 52000, cost: 30 });
  await b.repo.upsertIntervalOverride(vb.id, tires.id, { override_interval_km: 8000 });

  await a.sync(drive.transport);
  await b.sync(drive.transport);
  await a.sync(drive.transport);
  await b.sync(drive.transport);

  const keep = va.id < vb.id ? va.id : vb.id;
  for (const d of [a, b]) {
    const vehicles = await d.repo.getAllVehicles();
    assert.equal(vehicles.length, 1);
    assert.equal(vehicles[0].id, keep);
    assert.deepEqual(vehicles[0].maintenance_logs.map((l) => l.id).sort(), [la.id, lb.id].sort());
    assert.equal(vehicles[0].interval_overrides[0]?.override_interval_km, 8000);
  }
  assert.deepEqual(await liveState(a.db), await liveState(b.db));
});

test("custom service types with the same name are kept apart by renaming one", async () => {
  const drive = memoryDrive();
  const a = await device();
  const b = await device();
  const sa = await a.repo.createServiceType({ name: "Detailing", fields: [{ name: "Wax", field_type: "text" }] });
  const sb = await b.repo.createServiceType({ name: "Detailing", fields: [] });

  await a.sync(drive.transport);
  await b.sync(drive.transport);
  await a.sync(drive.transport);

  const renamed = sa.id > sb.id ? sa.id : sb.id;
  for (const d of [a, b]) {
    assert.equal((await d.repo.getServiceTypeById(renamed))?.name, "Detailing (2)");
    assert.equal((await d.repo.getServiceTypeById(renamed === sa.id ? sb.id : sa.id))?.name, "Detailing");
  }
  assert.deepEqual(await liveState(a.db), await liveState(b.db));
});

test("a log edited on one device while its vehicle is deleted on another ends up deleted", async () => {
  const drive = memoryDrive();
  const a = await device();
  const b = await device();
  const v = await a.repo.createVehicle({ make: "Mazda", model: "3" });
  const log = await a.repo.createMaintenanceLog(v.id, { date: "2025-04-01", mileage: 1000, cost: 10 });
  await a.sync(drive.transport);
  await b.sync(drive.transport);

  await a.repo.deleteVehicle(v.id);
  await b.repo.updateMaintenanceLog(log.id, { notes: "edited later" }); // newer than the delete
  await a.sync(drive.transport);
  await b.sync(drive.transport);
  await a.sync(drive.transport);

  for (const d of [a, b]) {
    assert.equal(await d.repo.getVehicleById(v.id), null);
    const [row] = await d.db.all<{ deleted_at: string | null }>("SELECT deleted_at FROM maintenance_logs WHERE id = ?", [log.id]);
    assert.notEqual(row.deleted_at, null);
  }
  assert.deepEqual(await liveState(a.db), await liveState(b.db));
});

test("compaction replaces change files with a snapshot a new device can start from", async () => {
  const drive = memoryDrive();
  const a = await device();
  const b = await device();
  const v = await a.repo.createVehicle({ make: "Ford", model: "Focus" });
  for (let i = 1; i <= 4; i++) {
    await a.repo.createMaintenanceLog(v.id, { date: `2025-05-0${i}`, mileage: 1000 * i, cost: i });
    await a.sync(drive.transport, { compactAfter: 3 });
  }
  const own = drive.names().map(parseSyncFileName).filter((n) => n?.deviceId === a.deviceId);
  assert.deepEqual(own.map((n) => n!.kind).sort(), ["changes", "snapshot"]);

  const result = await b.sync(drive.transport);
  assert.equal(result.downloaded, 1); // the snapshot covers the change file written with it
  assert.equal((await b.repo.getVehicleById(v.id))?.maintenance_logs.length, 4);
  assert.deepEqual(await liveState(a.db), await liveState(b.db));
});

test("files from a newer schema are not applied", async () => {
  const drive = memoryDrive();
  const a = await device();
  await drive.transport.create(syncFileName({ kind: "changes", deviceId: "future-device", seq: 1 }), {
    format: "carbaddie-sync",
    version: 1,
    kind: "changes",
    device_id: "future-device",
    seq: 1,
    schema_version: LATEST_SCHEMA_VERSION + 1,
    created_at: new Date().toISOString(),
    tables: {},
  });
  await assert.rejects(a.sync(drive.transport), /newer version of CarBaddie/);
});

test("resetting sync state makes the next sync re-send everything", async () => {
  const drive = memoryDrive();
  const a = await device();
  await a.repo.createVehicle({ make: "Kia", model: "Rio" });
  const first = await a.sync(drive.transport);
  await a.resetSync();
  const fresh = memoryDrive();
  const again = await a.sync(fresh.transport);
  assert.equal(again.uploaded, first.uploaded);
});
