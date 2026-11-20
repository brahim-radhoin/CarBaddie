// The input rules for user edits (validation.ts) as the repository applies them: real dates, no
// future history, nothing older than the vehicle, typed custom values, parts of the vehicle.

import { test } from "node:test";
import assert from "node:assert/strict";
import { openRepository } from "../src/db/open.ts";
import { BUILTIN_SERVICE_TYPES } from "../src/service-types/builtin.ts";
import { ZONE_OF_SLUG, groupServiceTypes, serviceTypeZone } from "../src/maintenance/zones.ts";
import { ValidationError, odometerConflict, odometerRecords, parseWholeNumber, vehicleStartDate } from "../src/validation.ts";
import { openTestDb } from "./helpers/sqlite.ts";

const TODAY = "2026-11-19";
let wall = 1_795_000_000_000;
const clock = () => (wall += 3);

async function open() {
  const db = openTestDb();
  return { db, ...(await openRepository(db, clock, { today: () => TODAY })) };
}

const fails = (field: string, pattern?: RegExp) => (e: unknown) => {
  assert.ok(e instanceof ValidationError, `expected a ValidationError, got ${e}`);
  assert.ok(field in e.fieldErrors, `expected an error on ${field}, got ${JSON.stringify(e.fieldErrors)}`);
  if (pattern) assert.match(e.fieldErrors[field].join(" "), pattern);
  return true;
};

const visit = (date: string, mileage = 50_000) => ({ date, mileage, items: [{ service_type_id: null, cost_cents: 0 }] });

test("a 2019 model can have history from 1 January 2018", () => {
  assert.equal(vehicleStartDate(2019), "2018-01-01");
  assert.equal(vehicleStartDate(null), null);
  assert.equal(vehicleStartDate(12), null);
});

test("visits, logs and odometer readings can't be later than today", async () => {
  const { repo } = await open();
  const v = await repo.createVehicle({ make: "Ford", model: "Fiesta", year: 2019 });
  await repo.createServiceEvent(v.id, visit(TODAY)); // today is fine
  await assert.rejects(repo.createServiceEvent(v.id, visit("2026-11-20")), fails("date", /later than today/));
  await assert.rejects(repo.createMaintenanceLog(v.id, { date: "2027-01-01", mileage: 1, cost_cents: 0 }), fails("date"));
  await assert.rejects(repo.addOdometerReading(v.id, { date: "2026-12-01", mileage: 60_000 }), fails("date"));
});

test("nor before the vehicle was built", async () => {
  const { repo } = await open();
  const v = await repo.createVehicle({ make: "Ford", model: "Fiesta", year: 2019 });
  await repo.createServiceEvent(v.id, visit("2018-01-01"));
  await assert.rejects(repo.createServiceEvent(v.id, visit("2017-12-31")), fails("date", /2018: a 2019 model/));
  await assert.rejects(repo.addOdometerReading(v.id, { date: "2010-05-05", mileage: 1 }), fails("date"));
  // Without a model year there is no lower bound.
  const old = await repo.createVehicle({ make: "Ford", model: "Model T" });
  await repo.createServiceEvent(old.id, visit("1950-06-01"));
});

test("text in a date field is rejected", async () => {
  const { repo } = await open();
  const v = await repo.createVehicle({ make: "Ford", model: "Fiesta" });
  await assert.rejects(repo.createServiceEvent(v.id, visit("last tuesday")), fails("date", /real date/));
  await assert.rejects(repo.createServiceEvent(v.id, visit("2026-02-30")), fails("date"));
  await assert.rejects(repo.createVehicle({ make: "Ford", model: "Ka", acquisition_date: "soon" }), fails("acquisition_date"));
});

test("an edit is only checked for what it changes", async () => {
  const { db, repo } = await open();
  const v = await repo.createVehicle({ make: "Ford", model: "Fiesta" });
  const ev = await repo.createServiceEvent(v.id, visit("2012-03-04"));
  // The year is set by an older app (no rules then): the visit now predates the vehicle.
  await db.run("UPDATE vehicles SET year = 2019 WHERE id = ?", [v.id]);
  // Forms resend the date and mileage with every save; the notes still change.
  const saved = await repo.updateServiceEvent(ev.id, { date: "2012-03-04", mileage: 50_000, notes: "Invoice 42", items: [{ id: ev.items[0].id, service_type_id: null, cost_cents: 0 }] });
  assert.equal(saved.notes, "Invoice 42");
  // Moving it to another date that breaks the rule is not allowed.
  await assert.rejects(repo.updateServiceEvent(ev.id, { date: "2013-01-01" }), fails("date"));
});

test("the model year is a real one and can't make the history older than the vehicle", async () => {
  const { repo } = await open();
  await assert.rejects(repo.createVehicle({ make: "Ford", model: "Fiesta", year: 1700 }), fails("year", /1886 to 2027/));
  await assert.rejects(repo.createVehicle({ make: "Ford", model: "Fiesta", year: 2028 }), fails("year"));
  const v = await repo.createVehicle({ make: "Ford", model: "Fiesta", year: 2027 }); // next year's models are on sale
  const old = await repo.createVehicle({ make: "Ford", model: "Focus" });
  await repo.createServiceEvent(old.id, visit("2015-06-01"));
  await assert.rejects(repo.updateVehicle(old.id, { year: 2019 }), fails("year", /goes back to/));
  await repo.updateVehicle(old.id, { year: 2016 }); // a 2016 model can have history from 2015
  await repo.updateVehicle(v.id, { year: 2026, make: "Ford" });
  await assert.rejects(repo.updateVehicle(v.id, { acquisition_date: "2024-12-31" }), fails("acquisition_date"));
});

test("odometer readings that are typos are rejected", async () => {
  const { repo } = await open();
  const v = await repo.createVehicle({ make: "Ford", model: "Fiesta" });
  await assert.rejects(repo.createServiceEvent(v.id, visit(TODAY, 45_000_000)), fails("mileage", /too high/));
  await assert.rejects(repo.createVehicle({ make: "Ford", model: "Ka", initial_mileage: -5 }), fails("initial_mileage"));
});

test("custom field values must fit their field's type; dates there may be in the future", async () => {
  const { repo } = await open();
  const battery = (await repo.getAllServiceTypes()).find((t) => t.slug === "battery-replacement")!;
  const oil = (await repo.getAllServiceTypes()).find((t) => t.slug === "oil-change")!;
  const warranty = battery.fields.find((f) => f.name === "Battery Warranty Expiration")!;
  const amount = oil.fields.find((f) => f.name === "Oil Amount")!;
  const v = await repo.createVehicle({ make: "Ford", model: "Fiesta" });
  const item = (stId: string, field_id: string, value: string) => ({ ...visit(TODAY), items: [{ service_type_id: stId, cost_cents: 0, custom_field_values: [{ field_id, value }] }] });

  await repo.createServiceEvent(v.id, item(battery.id, warranty.id, "2030-06-01"));
  await assert.rejects(repo.createServiceEvent(v.id, item(battery.id, warranty.id, "next june")), fails(`custom_field_values.${warranty.id}`, /real date/));
  await repo.createServiceEvent(v.id, item(oil.id, amount.id, "4,5"));
  await assert.rejects(repo.createServiceEvent(v.id, item(oil.id, amount.id, "four")), fails(`custom_field_values.${amount.id}`, /Oil Amount: enter a number/));
});

test("text is trimmed and loses control characters", async () => {
  const { repo } = await open();
  const v = await repo.createVehicle({ make: "  Ford\u0007 ", model: "Fies\nta" });
  assert.equal(v.make, "Ford");
  assert.equal(v.model, "Fies ta");
  await assert.rejects(repo.createVehicle({ make: "x".repeat(61), model: "A" }), fails("make", /60 characters/));
  const ev = await repo.createServiceEvent(v.id, { ...visit(TODAY), shop: "  Main St  ", notes: "line 1\nline 2\u0000" });
  assert.equal(ev.shop, "Main St");
  assert.equal(ev.notes, "line 1\nline 2");
});

test("every built-in sits in a part of the vehicle", () => {
  for (const st of BUILTIN_SERVICE_TYPES) assert.ok(ZONE_OF_SLUG[st.slug], `${st.slug} has no part`);
});

test("a service type's part: the chosen one, else the built-in's, else other; unknown ones show as unset", () => {
  assert.equal(serviceTypeZone({ slug: "oil-change", zone: null }), "engine");
  assert.equal(serviceTypeZone({ slug: "oil-change", zone: "cabin" }), "cabin");
  assert.equal(serviceTypeZone({ slug: null, zone: null }), "other");
  assert.equal(serviceTypeZone({ slug: null, zone: "roof" }), "other");
  const groups = groupServiceTypes([
    { name: "A", slug: "tire-rotation", zone: null },
    { name: "B", slug: null, zone: "engine" },
    { name: "C", slug: "oil-change", zone: null },
  ]);
  assert.deepEqual(groups.map((g) => [g.zone, g.types.map((t) => t.name)]), [["engine", ["B", "C"]], ["wheels", ["A"]]]);
});

test("parts are stored, validated, kept when a newer app's part comes back unchanged, and backed up", async () => {
  const { db, repo } = await open();
  const st = await repo.createServiceType({ name: "Wheel bearings", zone: "wheels", fields: [] });
  assert.equal(st.zone, "wheels");
  await assert.rejects(repo.createServiceType({ name: "Roof box", zone: "roof", fields: [] }), fails("zone"));
  await db.run("UPDATE service_types SET zone = 'roof' WHERE id = ?", [st.id]); // a newer app's part
  const renamed = await repo.updateServiceType(st.id, { name: "Wheel bearings, front", zone: "roof" });
  assert.equal(renamed.zone, "roof");
  await repo.updateServiceType(st.id, { zone: "underbody" });

  const backup = await repo.exportBackup({});
  assert.equal(backup.service_types.find((t) => t.name === "Wheel bearings, front")?.zone, "underbody");
  const other = await open();
  await other.repo.importBackup(backup, { vehicles_to_add: [], conflict_resolutions: [] });
  assert.equal((await other.repo.getAllServiceTypes()).find((t) => t.name === "Wheel bearings, front")?.zone, "underbody");
});

test("whole numbers as people type them", () => {
  assert.equal(parseWholeNumber("45000"), 45000);
  assert.equal(parseWholeNumber(" 45 000 "), 45000);
  assert.equal(parseWholeNumber("45,000"), 45000);
  assert.equal(parseWholeNumber("1.234.567"), 1234567);
  assert.equal(parseWholeNumber("12abc"), null);
  assert.equal(parseWholeNumber("4,5"), null);
  assert.equal(parseWholeNumber("-3"), null);
  assert.equal(parseWholeNumber(""), null);
});

test("an odometer reading out of step with the others is named, the nearest first", () => {
  const records = [
    { date: "2025-01-01", mileage: 40_000 },
    { date: "2025-06-01", mileage: 45_000 },
    { date: "2026-01-01", mileage: 50_000 },
  ];
  assert.equal(odometerConflict("2025-09-01", 47_000, records), null);
  assert.deepEqual(odometerConflict("2025-09-01", 30_000, records), { date: "2025-06-01", mileage: 45_000, kind: "higher-before" });
  assert.deepEqual(odometerConflict("2025-03-01", 60_000, records), { date: "2025-06-01", mileage: 45_000, kind: "lower-after" });
  assert.equal(odometerConflict("2025-06-01", 30_000, records.slice(1)), null, "the same day is not out of step");
  const v = {
    maintenance_logs: [{ id: "l1", event_id: "e1", date: "2025-06-01", mileage: 45_000 }],
    odometer_readings: [{ id: "r1", date: "2026-01-01", mileage: 50_000 }],
  };
  assert.equal(odometerRecords(v, { visitId: "e1" }).length, 1);
  assert.equal(odometerRecords(v, { readingId: "r1" }).length, 1);
});
