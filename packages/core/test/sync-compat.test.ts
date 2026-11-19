// Sync between app versions. A device that is ahead may add columns (an "additive" migration);
// a device that is behind must neither lose them nor be broken by them. Written so that a future
// change that breaks either direction fails here, before it ships.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { openRepository } from "../src/db/open.ts";
import { LATEST_SCHEMA_VERSION, MIGRATIONS, MIN_READER_VERSION } from "../src/db/migrations.ts";
import { adoptExtras } from "../src/sync/extras.ts";
import { syncFileName } from "../src/sync/files.ts";
import type { SyncTransport } from "../src/sync/transport.ts";
import { openTestDb, type TestDb } from "./helpers/sqlite.ts";

let wall = 1_780_000_000_000;
const clock = () => (wall += 7);

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
  return {
    transport,
    /** Forget one device's files, so what others know of it can only have come through the rest. */
    forget(deviceId: string) {
      for (const [id, f] of files) if (f.name.includes(`-${deviceId}-`)) files.delete(id);
    },
  };
}

type Device = { db: TestDb } & Awaited<ReturnType<typeof openRepository>>;
async function device(): Promise<Device> {
  const db = openTestDb();
  return { db, ...(await openRepository(db, clock)) };
}

/** A device whose app is a version ahead: its vehicles table has a column this one doesn't know. */
async function deviceAhead(): Promise<Device> {
  const d = await device();
  d.db.raw.exec("ALTER TABLE vehicles ADD COLUMN future_note TEXT");
  return d;
}

const note = async (d: Device, id: string) => (await d.db.all<{ future_note: string | null }>("SELECT future_note FROM vehicles WHERE id = ?", [id]))[0]?.future_note;
const vehicle = async (d: Device, id: string) => (await d.db.all<Record<string, unknown>>("SELECT * FROM vehicles WHERE id = ?", [id]))[0];

// ── a device that is behind carries what it doesn't know ────────────────────────────────────

test("a device behind keeps and re-sends a column it doesn't know, so it survives the trip", async () => {
  const drive = memoryDrive();
  const ahead = await deviceAhead();
  const behind = await device();

  const v = await ahead.repo.createVehicle({ make: "Ford", model: "Fiesta" });
  await ahead.db.run("UPDATE vehicles SET future_note = ? WHERE id = ?", ["from the future", v.id]);
  await ahead.sync(drive.transport);

  await behind.sync(drive.transport);
  assert.equal((await behind.repo.getVehicleById(v.id))?.make, "Ford", "the behind device reads the row");
  assert.equal(await behind.db.all("SELECT 1 FROM pragma_table_info('vehicles') WHERE name = 'future_note'").then((r) => r.length), 0);

  // The behind device edits the vehicle: its row is newer and carries no future_note of its own.
  await behind.repo.updateVehicle(v.id, { year: 2019 });
  await behind.sync(drive.transport);

  await ahead.sync(drive.transport);
  assert.equal(await note(ahead, v.id), "from the future", "the device ahead did not lose its column");
  assert.equal((await ahead.repo.getVehicleById(v.id))?.year, 2019, "and got the edit");

  // A third device that only ever sees the behind device's files still ends up with the column.
  drive.forget(ahead.deviceId);
  const another = await deviceAhead();
  await another.sync(drive.transport);
  assert.equal(await note(another, v.id), "from the future");
});

test("the carried column is adopted when the device is updated and learns it", async () => {
  const drive = memoryDrive();
  const ahead = await deviceAhead();
  const behind = await device();
  const v = await ahead.repo.createVehicle({ make: "Honda", model: "Jazz" });
  await ahead.db.run("UPDATE vehicles SET future_note = ? WHERE id = ?", ["kept", v.id]);
  await ahead.sync(drive.transport);
  await behind.sync(drive.transport);

  behind.db.raw.exec("ALTER TABLE vehicles ADD COLUMN future_note TEXT"); // the app update's migration
  await adoptExtras(behind.db);
  assert.equal(await note(behind, v.id), "kept");
  assert.equal((await behind.db.all("SELECT * FROM sync_extra")).length, 0, "nothing left to carry");
  const before = (await vehicle(behind, v.id)).updated_at;
  assert.equal(before, (await vehicle(ahead, v.id)).updated_at, "adopting is not an edit");
});

// ── copies of one row that carry different columns ──────────────────────────────────────────

const STAMP = (n: number, node = "x") => `${String(1_700_000_000_000 + n).padStart(15, "0")}-000000-${node}`;
const VEHICLE_ID = "0190a0a0-0000-7000-8000-0000000000c1";

function vehicleRow(over: Record<string, string | number | null>): Record<string, string | number | null> {
  return {
    id: VEHICLE_ID, make: "Ford", model: "Fiesta", year: null, vin: null, initial_mileage: null,
    acquisition_date: null, merged_into: null, deleted_at: null, ...over,
  };
}
function file(deviceId: string, seq: number, row: Record<string, string | number | null>) {
  return {
    format: "carbaddie-sync", version: 1, kind: "changes", device_id: deviceId, seq,
    schema_version: LATEST_SCHEMA_VERSION, min_reader: MIN_READER_VERSION, created_at: "2026-01-01T00:00:00.000Z",
    tables: { vehicles: [row] },
  };
}
const full = (stamp: string, over = {}) => vehicleRow({ body_type: "motorbike", is_favorite: 1, updated_at: stamp, device_id: "x", ...over });
const stripped = (stamp: string, over = {}) => {
  const { body_type: _b, is_favorite: _f, ...rest } = full(stamp, over);
  return rest as Record<string, string | number | null>; // written by an app that doesn't have the columns
};

async function put(drive: ReturnType<typeof memoryDrive>, deviceId: string, f: ReturnType<typeof file>) {
  await drive.transport.create(syncFileName({ kind: "changes", deviceId, seq: f.seq }), f);
}

for (const order of ["full first", "stripped first"] as const) {
  test(`a stripped copy newer than a full one keeps the columns it lacks (${order})`, async () => {
    const drive = memoryDrive();
    const fullFile = file("dev-x", 1, full(STAMP(1, "dev-x"), { device_id: "dev-x" }));
    const strippedFile = file("dev-y", 1, stripped(STAMP(5, "dev-y"), { make: "Ford Motor", device_id: "dev-y" }));
    if (order === "full first") { await put(drive, "dev-x", fullFile); await put(drive, "dev-y", strippedFile); }
    else { await put(drive, "dev-y", strippedFile); await put(drive, "dev-x", fullFile); }
    const fresh = await device();
    await fresh.sync(drive.transport);
    const row = await vehicle(fresh, VEHICLE_ID);
    assert.equal(row.make, "Ford Motor", "the newer copy wins for what it carries");
    assert.equal(row.body_type, "motorbike", "the older copy fills what the newer one lacks");
    assert.equal(row.is_favorite, 1);
  });

  test(`the same write with and without the columns combines (${order})`, async () => {
    const drive = memoryDrive();
    const same = STAMP(3, "dev-x");
    const a = file("dev-x", 1, full(same, { device_id: "dev-x" }));
    const b = file("dev-y", 1, stripped(same, { device_id: "dev-x" }));
    if (order === "full first") { await put(drive, "dev-x", a); await put(drive, "dev-y", b); }
    else { await put(drive, "dev-y", b); await put(drive, "dev-x", a); }
    const fresh = await device();
    await fresh.sync(drive.transport);
    assert.equal((await vehicle(fresh, VEHICLE_ID)).body_type, "motorbike");
  });
}

test("a device that took the stripped copy first is healed when the full copy arrives later", async () => {
  const drive = memoryDrive();
  const same = STAMP(3, "dev-x");
  await put(drive, "dev-y", file("dev-y", 1, stripped(same, { device_id: "dev-x" })));
  const d = await device();
  await d.sync(drive.transport);
  assert.equal((await vehicle(d, VEHICLE_ID)).body_type, null);

  await put(drive, "dev-x", file("dev-x", 1, full(same, { device_id: "dev-x" })));
  const again = await d.sync(drive.transport);
  assert.equal((await vehicle(d, VEHICLE_ID)).body_type, "motorbike");
  assert.equal(again.applied, 1);
});

test("an older copy never overwrites a newer local edit", async () => {
  const drive = memoryDrive();
  const d = await device();
  const v = await d.repo.createVehicle({ make: "Ford", model: "Fiesta", body_type: "car" });
  await put(drive, "dev-x", file("dev-x", 1, { ...full(STAMP(1, "dev-x")), id: v.id, body_type: "motorbike", device_id: "dev-x" }));
  await d.sync(drive.transport);
  assert.equal((await d.repo.getVehicleById(v.id))?.body_type, "car");
});

// ── what a reader will and won't read ───────────────────────────────────────────────────────

test("a file from a newer additive version is read when the oldest reader it needs is this one", async () => {
  const drive = memoryDrive();
  const f = file("dev-x", 1, full(STAMP(2, "dev-x"), { device_id: "dev-x" }));
  await put(drive, "dev-x", { ...f, schema_version: LATEST_SCHEMA_VERSION + 3, min_reader: MIN_READER_VERSION });
  const d = await device();
  const result = await d.sync(drive.transport);
  assert.deepEqual(result.blocked, []);
  assert.equal((await vehicle(d, VEHICLE_ID)).body_type, "motorbike");
});

test("a file in a format this app doesn't know is blocked, not reported as invalid", async () => {
  const drive = memoryDrive();
  await put(drive, "dev-x", { ...file("dev-x", 1, full(STAMP(2, "dev-x"))), version: 2 } as ReturnType<typeof file>);
  const d = await device();
  const result = await d.sync(drive.transport);
  assert.equal(result.blocked.length, 1);
  assert.equal(result.blocked[0].deviceId, "dev-x");
});

test("a file that isn't a CarBaddie sync file is rejected", async () => {
  const drive = memoryDrive();
  await drive.transport.create(syncFileName({ kind: "changes", deviceId: "dev-x", seq: 1 }), { hello: "world" });
  const d = await device();
  await assert.rejects(d.sync(drive.transport), /Invalid sync file/);
});

// ── the rule for every migration from now on ────────────────────────────────────────────────

test("every migration says whether older apps can keep syncing after it", () => {
  for (const m of MIGRATIONS) assert.ok(m.compat === "additive" || m.compat === "breaking", `migration v${m.version} has no compat`);
  assert.ok(MIN_READER_VERSION <= LATEST_SCHEMA_VERSION);
  assert.equal(MIGRATIONS.find((m) => m.version === 8)?.compat, "additive");
  // Migrations that shipped before the rule are breaking, so the floor is the last of them.
  assert.equal(MIN_READER_VERSION, 7);
});

// ── files written by released versions must stay readable forever ──────────────────────────

for (const name of ["sync-file-v7.json", "sync-file-v8.json"]) {
  test(`the committed ${name} still applies`, async () => {
    const f = JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8"));
    const drive = memoryDrive();
    await drive.transport.create(syncFileName({ kind: "changes", deviceId: f.device_id, seq: f.seq }), f);
    const d = await device();
    const result = await d.sync(drive.transport);
    assert.deepEqual(result.blocked, []);
    const vehicles = await d.repo.getAllVehicles();
    assert.equal(vehicles.length, 1);
    assert.equal(vehicles[0].make, "Ford");
    if (name.includes("v8")) {
      assert.equal(vehicles[0].body_type, "car");
      assert.equal(vehicles[0].is_favorite, true);
    } else {
      assert.equal(vehicles[0].body_type, null);
      assert.equal(vehicles[0].is_favorite, null);
    }
  });
}
