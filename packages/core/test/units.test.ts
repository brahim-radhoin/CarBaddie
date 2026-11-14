import { test } from "node:test";
import assert from "node:assert/strict";
import { openRepository } from "../src/db/open.ts";
import { syncFileName } from "../src/sync/files.ts";
import { computeUpcomingMaintenance } from "../src/maintenance/upcoming.ts";
import {
  centsToInput,
  formatDistance,
  formatMoney,
  fromDisplayDistance,
  parseMoney,
  toDisplayDistance,
} from "../src/units.ts";
import { ValidationError } from "../src/validation.ts";
import type { SyncTransport } from "../src/sync/transport.ts";
import { openTestDb } from "./helpers/sqlite.ts";

let wall = 1_790_000_000_000;
const clock = () => (wall += 3);

function memoryDrive() {
  const files = new Map<string, { name: string; content: string }>();
  let n = 0;
  const transport: SyncTransport = {
    list: async () => [...files].map(([id, f]) => ({ id, name: f.name })),
    read: async (f) => JSON.parse(files.get(f.id)!.content),
    create: async (name, c) => void files.set(String(++n), { name, content: JSON.stringify(c) }),
    remove: async (f) => void files.delete(f.id),
  };
  return transport;
}

test("typed amounts become exact cents", () => {
  assert.equal(parseMoney("12"), 1200);
  assert.equal(parseMoney("12.5"), 1250);
  assert.equal(parseMoney("12,50"), 1250);
  assert.equal(parseMoney("0.1"), 10);
  assert.equal(parseMoney("19.99"), 1999);
  assert.equal(parseMoney("1,234.56"), 123456);
  assert.equal(parseMoney("1.234,56"), 123456);
  assert.equal(parseMoney("1,234"), 123400);
  assert.equal(parseMoney(" "), 0);
  assert.equal(parseMoney("-5"), null);
  assert.equal(parseMoney("abc"), null);
  assert.equal(centsToInput(1250), "12.50");
  assert.equal(centsToInput(0), "");
});

test("money is shown in the chosen currency", () => {
  assert.match(formatMoney(123456, "EUR"), /1.?234[.,]56/);
  assert.match(formatMoney(123456, "EUR"), /€/);
  assert.match(formatMoney(5, "USD"), /0[.,]05/);
  assert.equal(formatMoney(100, "NOTACODE"), "1.00 NOTACODE");
});

test("distances are stored in km and shown in km or miles", () => {
  assert.equal(toDisplayDistance(160934, "mi"), 100000);
  assert.equal(fromDisplayDistance(100000, "mi"), 160934);
  assert.equal(toDisplayDistance(12345, "km"), 12345);
  assert.equal(formatDistance(1609, "mi"), `${(1000).toLocaleString()} mi`);
  // Round trip stays within a kilometre.
  for (const km of [0, 1, 999, 8000, 123457]) {
    assert.ok(Math.abs(fromDisplayDistance(toDisplayDistance(km, "mi"), "mi") - km) <= 1);
  }
});

test("due-date messages use the chosen unit", () => {
  const items = computeUpcomingMaintenance({
    vehicle: { initial_mileage: 0, acquisition_date: "2025-01-01", maintenance_logs: [{ mileage: 7200 }], interval_overrides: [] },
    serviceTypeSummaries: [{ service_type_id: "oil", last_log_date: "2025-06-01", last_log_mileage: 0 }],
    allServiceTypes: [{ id: "oil", name: "Oil Change", recommended_interval_km: 8000 }],
    today: new Date("2025-06-10T12:00:00"),
    distanceUnit: "mi",
  });
  assert.equal(items[0].message, "Due in 497 mi");
});

test("currency and distance unit are shared preferences that sync", async () => {
  const drive = memoryDrive();
  const a = await openRepository(openTestDb(), clock);
  const b = await openRepository(openTestDb(), clock);
  assert.deepEqual(await a.repo.getPreferences(), { currency: "USD", distance_unit: "km" });

  await a.repo.setPreference("currency", "EUR");
  await b.repo.setPreference("distance_unit", "mi");
  await b.repo.setPreference("currency", "GBP", { ifUnset: true }); // b had none: taken
  await a.repo.setPreference("currency", "TND", { ifUnset: true }); // a already has one: ignored
  await a.sync(drive);
  await b.sync(drive);
  await a.sync(drive);
  // b's GBP is newer than a's EUR.
  for (const d of [a, b]) assert.deepEqual(await d.repo.getPreferences(), { currency: "GBP", distance_unit: "mi" });

  await assert.rejects(a.repo.setPreference("currency", "euro"), ValidationError);
  await assert.rejects(a.repo.setPreference("distance_unit", "yards" as "km"), ValidationError);
});

test("costs are validated as whole cents", async () => {
  const { repo } = await openRepository(openTestDb(), clock);
  const v = await repo.createVehicle({ make: "Seat", model: "Ibiza" });
  await assert.rejects(repo.createMaintenanceLog(v.id, { date: "2025-01-01", mileage: 10, cost_cents: 12.5 }), ValidationError);
  await assert.rejects(repo.createMaintenanceLog(v.id, { date: "2025-01-01", mileage: -1, cost_cents: 0 }), ValidationError);
  const log = await repo.createMaintenanceLog(v.id, { date: "2025-01-01", mileage: 10, cost_cents: 1999 });
  assert.equal(log.cost_cents, 1999);
  assert.equal((await repo.getMaintenanceSummary(v.id)).total_cost_cents, 1999);
});

test("logs from a device still on schema v4 arrive with their cost converted", async () => {
  const drive = memoryDrive();
  const a = await openRepository(openTestDb(), clock);
  const v = await a.repo.createVehicle({ make: "Dacia", model: "Logan" });
  await a.sync(drive);

  // What an old device wrote: `cost` as a decimal, no cost_cents.
  const stamp = "001790000000000-000000-old-device";
  await drive.create(syncFileName({ kind: "changes", deviceId: "old-device", seq: 1 }), {
    format: "carbaddie-sync",
    version: 1,
    kind: "changes",
    device_id: "old-device",
    seq: 1,
    schema_version: 4,
    created_at: new Date().toISOString(),
    tables: {
      maintenance_logs: [
        { id: "old-log", vehicle_id: v.id, service_type_id: null, date: "2025-04-01", mileage: 500, cost: 45.1,
          notes: null, updated_at: stamp, deleted_at: null, device_id: "old-device" },
      ],
    },
  });
  await a.sync(drive);
  assert.equal((await a.repo.getLogById("old-log"))?.cost_cents, 4510);
});
