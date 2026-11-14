import { test } from "node:test";
import assert from "node:assert/strict";
import {
  checkReminders,
  collectReminders,
  computeReminders,
  getNotifiedReminderKeys,
  getRemindersEnabled,
  pickNewReminders,
  reminderNotifications,
  setRemindersEnabled,
  type Reminder,
} from "../src/maintenance/reminders.ts";
import { openRepository } from "../src/db/open.ts";
import type { MaintenanceLogRead, ServiceTypeLogSummary, ServiceTypeRead, VehicleRead } from "../src/types.ts";
import { openTestDb } from "./helpers/sqlite.ts";

const TODAY = new Date(2026, 0, 31); // 31 Jan 2026, local time

function serviceType(id: string, name: string, km: number | null, days: number | null): ServiceTypeRead {
  return {
    id,
    slug: null,
    name,
    fields: [],
    resets: [],
    suggestions: [],
    recommended_interval_km: km,
    recommended_interval_days: days,
  };
}

function log(date: string, mileage: number, serviceTypeId: string): MaintenanceLogRead {
  return {
    id: `log-${serviceTypeId}-${date}`,
    vehicle_id: "car",
    date,
    mileage,
    cost_cents: 0,
    notes: null,
    service_type_id: serviceTypeId,
    service_type: null,
    custom_field_values: [],
  };
}

function summary(serviceTypeId: string, date: string, mileage: number): ServiceTypeLogSummary {
  return {
    service_type_id: serviceTypeId,
    service_type_name: "",
    log_count: 1,
    last_log_date: date,
    last_log_mileage: mileage,
    total_cost_cents: 0,
  };
}

const TYPES = [
  serviceType("oil", "Oil change", null, 365),
  serviceType("tyres", "Tyre rotation", 10_000, null),
  serviceType("wipers", "Wiper blades", null, 365),
  serviceType("coolant", "Coolant", null, 730),
];

/** Oil overdue by date, tyres due soon by distance, wipers fine, coolant never done. */
function garage(logs: MaintenanceLogRead[] = [log("2026-01-20", 19_500, "wipers"), log("2025-01-01", 10_000, "oil")]) {
  const vehicle: VehicleRead = {
    id: "car",
    make: "Ford",
    model: "Fiesta",
    year: 2003,
    vin: null,
    initial_mileage: 0,
    acquisition_date: null,
    maintenance_logs: logs,
    interval_overrides: [],
  };
  const summaries = [summary("oil", "2025-01-01", 10_000), summary("tyres", "2025-06-01", 10_000), summary("wipers", "2026-01-20", 19_500)];
  return { vehicles: [vehicle], summariesByVehicle: { car: summaries }, serviceTypes: TYPES };
}

const byType = (reminders: Reminder[]) => Object.fromEntries(reminders.map((r) => [r.serviceTypeId, r]));

test("reminds only about overdue and upcoming services", () => {
  const reminders = computeReminders({ ...garage(), today: TODAY });
  assert.deepEqual(reminders.map((r) => [r.serviceTypeId, r.status]), [
    ["oil", "Overdue"],
    ["tyres", "Upcoming"],
  ]);
  const { oil, tyres } = byType(reminders);
  assert.equal(oil.title, "Oil change overdue");
  assert.equal(oil.body, "Ford Fiesta: Overdue by 30 days");
  assert.equal(oil.dueDate, "2026-01-01");
  assert.equal(oil.dueKm, null);
  assert.equal(tyres.title, "Tyre rotation due soon");
  assert.equal(tyres.dueKm, 20_000);
  assert.equal(tyres.dueDate, null);
});

test("texts use the distance unit", () => {
  const { tyres } = byType(computeReminders({ ...garage(), today: TODAY, distanceUnit: "mi" }));
  assert.match(tyres.body, /^Ford Fiesta: Due in 311 mi$/);
  const { tyres: inKm } = byType(computeReminders({ ...garage(), today: TODAY }));
  assert.match(inKm.body, /^Ford Fiesta: Due in 500 km$/);
});

test("keys stay the same while the same occurrence is due", () => {
  // Due 1 Nov 2026 all through October, including across the autumn DST change where the
  // engine counts one day more (from the 3rd: on the 2nd that extra day puts it past 30 days).
  const input = {
    vehicles: garage().vehicles,
    summariesByVehicle: { car: [summary("monthly", "2026-10-02", 0)] },
    serviceTypes: [serviceType("monthly", "Monthly check", null, 30)],
  };
  const keys = new Set<string>();
  for (let day = 3; day <= 31; day++) {
    const [r] = computeReminders({ ...input, today: new Date(2026, 9, day) });
    assert.equal(r.status, "Upcoming");
    assert.equal(r.dueDate, "2026-11-01");
    keys.add(r.key);
  }
  assert.equal(keys.size, 1);
});

test("turning overdue or a new due cycle gives a new key", () => {
  const { oil } = byType(computeReminders({ ...garage(), today: TODAY }));
  // Same oil change, a month earlier: due soon, not overdue yet.
  const { oil: soon } = byType(computeReminders({ ...garage(), today: new Date(2025, 11, 20) }));
  assert.equal(soon.status, "Upcoming");
  assert.notEqual(soon.key, oil.key);

  // Oil changed today, then overdue again a year and a bit later: a different occurrence.
  const next = garage();
  next.summariesByVehicle.car[0] = summary("oil", "2026-01-31", 20_000);
  const later = byType(computeReminders({ ...next, today: new Date(2027, 1, 15) }));
  assert.equal(later.oil.status, "Overdue");
  assert.equal(later.oil.dueDate, "2027-01-31");
  assert.notEqual(later.oil.key, oil.key);
});

test("pickNewReminders skips notified ones and keeps only active keys", () => {
  const reminders = computeReminders({ ...garage(), today: TODAY });
  const first = pickNewReminders(reminders, []);
  assert.equal(first.toNotify.length, 2);
  assert.deepEqual(first.keep, reminders.map((r) => r.key));

  const again = pickNewReminders(reminders, [...first.keep, "gone|old|Overdue|2020-01-01|"]);
  assert.deepEqual(again.toNotify, []);
  assert.deepEqual(again.keep, first.keep, "the stale key is pruned");

  const doubled = pickNewReminders([...reminders, reminders[0]], []);
  assert.equal(doubled.toNotify.length, 2);
});

test("many new reminders become one summary notification", () => {
  const reminders = computeReminders({ ...garage(), today: TODAY });
  assert.deepEqual(reminderNotifications(reminders), reminders.map(({ title, body }) => ({ title, body })));
  const [only] = reminderNotifications(reminders, 1);
  assert.equal(only.title, "Maintenance: 1 overdue, 1 due soon");
  assert.equal(only.body, "Ford Fiesta: Oil change overdue\nand 1 more");
});

test("collectReminders and checkReminders over a real repository", async () => {
  let wall = 1_760_000_000_000;
  const { repo } = await openRepository(openTestDb(), () => wall++);
  await repo.setPreference("distance_unit", "mi");
  const st = await repo.createServiceType({ name: "Inspection", recommended_interval_days: 365, fields: [] });
  const v = await repo.createVehicle({ make: "Toyota", model: "Corolla" });
  await repo.createMaintenanceLog(v.id, { date: "2025-01-01", mileage: 1000, cost_cents: 0, service_type_id: st.id });

  const reminders = await collectReminders(repo, TODAY);
  const inspection = reminders.find((r) => r.serviceTypeId === st.id);
  assert.equal(inspection?.status, "Overdue");
  assert.equal(inspection?.vehicleName, "Toyota Corolla");
  // Built-in service types were never logged for this car, so nothing else is due.
  assert.deepEqual(reminders.map((r) => r.serviceTypeId), [st.id]);

  assert.equal(await getRemindersEnabled(repo), true, "on by default");
  const shown: Reminder[][] = [];
  const notify = async (batch: Reminder[]) => void shown.push(batch);
  await checkReminders(repo, { notify, today: TODAY });
  await checkReminders(repo, { notify, today: TODAY });
  assert.deepEqual(shown.map((batch) => batch.map((r) => r.key)), [[inspection!.key]], "notified once");
  assert.deepEqual(await getNotifiedReminderKeys(repo), [inspection!.key]);

  // Logging the service ends the occurrence; its key is dropped.
  await repo.createMaintenanceLog(v.id, { date: "2026-01-30", mileage: 2000, cost_cents: 0, service_type_id: st.id });
  await checkReminders(repo, { notify, today: TODAY });
  assert.deepEqual(await getNotifiedReminderKeys(repo), []);
  assert.equal(shown.length, 1);

  // A failed delivery is retried next time.
  const other = await repo.createServiceType({ name: "Brake fluid", recommended_interval_days: 365, fields: [] });
  await repo.createMaintenanceLog(v.id, { date: "2024-06-01", mileage: 600, cost_cents: 0, service_type_id: other.id });
  await assert.rejects(checkReminders(repo, { notify: async () => { throw new Error("denied"); }, today: TODAY }));
  await checkReminders(repo, { notify, today: TODAY });
  assert.deepEqual(shown[1].map((r) => r.serviceTypeId), [other.id]);

  await setRemindersEnabled(repo, false);
  assert.equal(await getRemindersEnabled(repo), false);
});
