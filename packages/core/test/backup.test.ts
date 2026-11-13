import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeBackup, parseBackup } from "../src/backup/format.ts";
import type { ServiceTypeRead, VehicleRead } from "../src/types.ts";

const ST_OIL = "0190a0a0-0000-7000-8000-0000000000a1";
const ST_FILTER = "0190a0a0-0000-7000-8000-0000000000a2";
const F_GRADE = "0190a0a0-0000-7000-8000-0000000000f1";
const F_OLD = "0190a0a0-0000-7000-8000-0000000000f2";
const V1 = "0190a0a0-0000-7000-8000-0000000000b1";

const serviceTypes: ServiceTypeRead[] = [
  {
    id: ST_OIL,
    slug: "oil-change",
    name: "Oil Change",
    recommended_interval_km: 8000,
    recommended_interval_days: 180,
    fields: [
      { id: F_GRADE, name: "Oil grade", field_type: "text", unit: null },
      { id: F_OLD, name: "Brand", field_type: "text", unit: null, archived: true },
    ],
    resets: [ST_FILTER],
    suggestions: [],
  },
  { id: ST_FILTER, slug: null, name: "Filter", fields: [], resets: [], suggestions: [], recommended_interval_km: null },
];

const vehicles: VehicleRead[] = [
  {
    id: V1,
    make: "Toyota",
    model: "Corolla",
    year: 2015,
    vin: " JTDBR32E720012345 ",
    initial_mileage: 90000,
    acquisition_date: "2020-01-15",
    maintenance_logs: [
      {
        id: "log-1",
        vehicle_id: V1,
        service_type_id: ST_OIL,
        service_type: null,
        date: "2025-06-01",
        mileage: 95000,
        cost: 79.5,
        notes: null,
        custom_field_values: [
          { id: "cfv-1", field_id: F_GRADE, value: "0W-20", custom_field: serviceTypes[0].fields[0] },
          { id: "cfv-2", field_id: F_OLD, value: "Castrol", custom_field: serviceTypes[0].fields[1] },
        ],
      },
    ],
    interval_overrides: [{ id: "ov-1", vehicle_id: V1, service_type_id: ST_OIL, override_interval_km: 10000 }],
  },
];

test("encoded backups use file-local integer ids and survive a JSON round trip", () => {
  const file = encodeBackup({ serviceTypes, vehicles, config: { vehicle_ids: [V1] }, exportedAt: new Date(0) });
  const parsed = parseBackup(JSON.parse(JSON.stringify(file)));
  assert.deepEqual(parsed, file);

  assert.deepEqual(file.service_types.map((s) => s.id), [1, 2]);
  assert.deepEqual(file.service_types[0].resets, [2]);
  assert.deepEqual(file.service_types[0].fields.map((f) => [f.id, f.archived]), [[1, undefined], [2, true]]);
  const v = file.vehicles[0];
  assert.equal(v.vin, "JTDBR32E720012345");
  assert.equal(v.maintenance_logs[0].service_type_id, 1);
  assert.deepEqual(v.maintenance_logs[0].custom_field_values.map((c) => [c.field_id, c.value]), [[1, "0W-20"], [2, "Castrol"]]);
  assert.deepEqual(v.interval_overrides[0], {
    id: 1, vehicle_id: 1, service_type_id: 1, override_interval_km: 10000, override_interval_days: null,
  });
  assert.deepEqual(file.metadata.config_used.vehicle_ids, [1], "no local UUIDs leak into the file");
  assert.ok(!JSON.stringify(file).includes(V1));
});

test("files from older desktop and mobile versions are normalised", () => {
  const parsed = parseBackup({
    metadata: { export_date_utc: "2025-01-01T00:00:00Z", config_used: { vehicle_ids: null } },
    service_types: [
      { id: 7, name: "Oil Change", fields: [{ id: 3, name: "Grade", field_type: "string" }], resets: [{ id: 8 }] },
      { id: 8, name: "Filter", recommended_interval_km: 8000 },
    ],
    vehicles: [
      {
        id: 4,
        make: "Honda",
        model: "Civic",
        vin: "",
        maintenance_logs: [
          {
            id: 1,
            date: "2025-02-02",
            mileage: "12000",
            cost: "45.10",
            service_type_id: 7,
            service_type: { id: 7, name: "Oil Change" },
            custom_field_values: [{ id: 9, value: 5, custom_field: { id: 3, name: "Grade", field_type: "text" } }],
          },
        ],
      },
    ],
  });
  assert.equal(parsed.service_types[0].fields[0].field_type, "text");
  assert.deepEqual(parsed.service_types[0].resets, [8]);
  assert.deepEqual(parsed.service_types[1].fields, []);
  const v = parsed.vehicles[0];
  assert.equal(v.vin, null);
  assert.deepEqual(v.interval_overrides, []);
  const log = v.maintenance_logs[0];
  assert.equal(log.mileage, 12000);
  assert.equal(log.cost, 45.1);
  assert.equal(log.custom_field_values[0].field_id, 3);
  assert.equal(log.custom_field_values[0].value, "5");
});

test("invalid files are rejected with the failing path", () => {
  assert.throws(() => parseBackup({ vehicles: [] }), /Invalid backup file at metadata/);
  assert.throws(
    () => parseBackup({ metadata: { export_date_utc: "x" }, service_types: [], vehicles: [{ id: 1, model: "x" }] }),
    /vehicles\.0\.make/,
  );
});
