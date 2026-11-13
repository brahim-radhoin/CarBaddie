import { test } from "node:test";
import assert from "node:assert/strict";
import { computeUpcomingMaintenance } from "../src/maintenance/upcoming.ts";
import type {
  MaintenanceLogRead,
  ServiceTypeLogSummary,
  ServiceTypeRead,
  UpcomingMaintenanceItemData,
  VehicleRead,
  VehicleServiceIntervalOverrideRead,
} from "../src/types.ts";

// Fixed "today" so results don't depend on the clock. Dates in these tests stay in the
// same half of the year as TODAY so daylight-saving shifts can't change day counts.
const TODAY = new Date(2026, 0, 31); // 31 Jan 2026, local time

// Fixtures use small numbers for readability; ids are strings in the data model.
type IntervalOpts = Partial<Pick<ServiceTypeRead, "recommended_interval_km" | "recommended_interval_days">> & { resets?: number[] };

function serviceType(id: number, name: string, { resets = [], ...opts }: IntervalOpts = {}): ServiceTypeRead {
  return {
    id: String(id),
    slug: null,
    name,
    fields: [],
    resets: resets.map(String),
    suggestions: [],
    recommended_interval_km: null,
    recommended_interval_days: null,
    ...opts,
  };
}

function log(id: number, date: string, mileage: number, serviceTypeId: number): MaintenanceLogRead {
  return {
    id: String(id),
    vehicle_id: "1",
    date,
    mileage,
    cost: 0,
    notes: null,
    service_type_id: String(serviceTypeId),
    service_type: null,
    custom_field_values: [],
  };
}

function vehicle(
  opts: {
    logs?: MaintenanceLogRead[];
    overrides?: VehicleServiceIntervalOverrideRead[];
    initialMileage?: number;
    acquisitionDate?: string;
  } = {},
): VehicleRead {
  return {
    id: "1",
    make: "Ford",
    model: "Fiesta",
    year: 2003,
    vin: null,
    initial_mileage: opts.initialMileage ?? 0,
    acquisition_date: opts.acquisitionDate ?? null,
    maintenance_logs: opts.logs ?? [],
    interval_overrides: opts.overrides ?? [],
  };
}

function summary(serviceTypeId: number, date: string | null, mileage: number | null): ServiceTypeLogSummary {
  return {
    service_type_id: String(serviceTypeId),
    service_type_name: "",
    log_count: 1,
    last_log_date: date,
    last_log_mileage: mileage,
    total_cost_for_service_type: 0,
  };
}

function compute(
  v: VehicleRead | undefined,
  types: ServiceTypeRead[],
  summaries: ServiceTypeLogSummary[],
): UpcomingMaintenanceItemData[] {
  return computeUpcomingMaintenance({ vehicle: v, allServiceTypes: types, serviceTypeSummaries: summaries, today: TODAY });
}

function only(items: UpcomingMaintenanceItemData[]): UpcomingMaintenanceItemData {
  assert.equal(items.length, 1, `expected exactly one item, got ${items.length}`);
  return items[0];
}

test("returns nothing without a vehicle or service types", () => {
  assert.deepEqual(compute(undefined, [serviceType(1, "Oil", { recommended_interval_days: 180 })], []), []);
  assert.deepEqual(compute(vehicle(), [], []), []);
});

test("skips service types that have no interval", () => {
  assert.deepEqual(compute(vehicle(), [serviceType(1, "Headlight bulb")], []), []);
});

test("overdue by date", () => {
  // 1 Aug 2025 + 180 days = 28 Jan 2026, three days before TODAY.
  const item = only(compute(vehicle(), [serviceType(1, "Oil change", { recommended_interval_days: 180 })], [summary(1, "2025-08-01", null)]));
  assert.equal(item.status, "Overdue");
  assert.equal(item.details?.byDate?.remainingDays, -3);
  assert.equal(item.message, "Overdue by 3 days");
});

test("overdue by mileage uses the newest log as current mileage", () => {
  const v = vehicle({ logs: [log(2, "2026-01-20", 19000, 9), log(1, "2025-12-01", 10000, 1)] });
  const item = only(compute(v, [serviceType(1, "Oil change", { recommended_interval_km: 8000 })], [summary(1, "2025-12-01", 10000)]));
  assert.equal(item.status, "Overdue");
  assert.deepEqual(item.details?.byMileage, { due: 18000, remainingKm: -1000 });
});

test("upcoming within the km threshold", () => {
  const v = vehicle({ logs: [log(2, "2026-01-20", 17500, 9)] });
  const item = only(compute(v, [serviceType(1, "Oil change", { recommended_interval_km: 8000 })], [summary(1, "2025-12-01", 10000)]));
  assert.equal(item.status, "Upcoming");
  assert.equal(item.details?.byMileage?.remainingKm, 500);
});

test("upcoming within the day threshold", () => {
  // 20 Aug 2025 + 180 days = 16 Feb 2026, 16 days after TODAY.
  const item = only(compute(vehicle(), [serviceType(1, "Oil change", { recommended_interval_days: 180 })], [summary(1, "2025-08-20", null)]));
  assert.equal(item.status, "Upcoming");
  assert.equal(item.message, "Due in 16 days");
});

test("OK when the next due date is far away", () => {
  const item = only(compute(vehicle(), [serviceType(1, "Wipers", { recommended_interval_days: 365 })], [summary(1, "2026-01-01", null)]));
  assert.equal(item.status, "OK");
  assert.equal(item.message, "Next due in 335 days");
});

test("never done when there is no history, measured from acquisition", () => {
  const v = vehicle({ acquisitionDate: "2025-12-01" });
  const item = only(compute(v, [serviceType(1, "Oil change", { recommended_interval_days: 180 })], []));
  assert.equal(item.status, "NeverDone");
  assert.ok(item.details?.byDate, "due date is estimated from the acquisition date");
});

test("a service that resets another counts as performing it", () => {
  const oilChange = serviceType(1, "Oil change", { recommended_interval_days: 180, resets: [2] });
  const oilFilter = serviceType(2, "Oil filter", { recommended_interval_days: 180 });
  const items = compute(vehicle(), [oilChange, oilFilter], [summary(1, "2026-01-10", 15000)]);
  const filter = items.find((i) => i.serviceTypeId === "2");
  assert.equal(filter?.status, "OK");
  assert.equal(filter?.details?.lastPerformed?.mileage, 15000);
});

test("a vehicle override replaces the recommended interval", () => {
  const override: VehicleServiceIntervalOverrideRead = {
    id: "1",
    vehicle_id: "1",
    service_type_id: "1",
    override_interval_km: 5000,
    override_interval_days: null,
  };
  const v = vehicle({ logs: [log(2, "2026-01-20", 15500, 9)], overrides: [override] });
  const item = only(compute(v, [serviceType(1, "Oil change", { recommended_interval_km: 8000 })], [summary(1, "2025-12-01", 10000)]));
  assert.equal(item.status, "Overdue");
  assert.equal(item.details?.byMileage?.due, 15000);
});

test("sorts Overdue, Upcoming, NeverDone, then OK", () => {
  const types = [
    serviceType(1, "ok", { recommended_interval_days: 365 }),
    serviceType(2, "never", { recommended_interval_days: 365 }),
    serviceType(3, "upcoming", { recommended_interval_days: 180 }),
    serviceType(4, "overdue", { recommended_interval_days: 180 }),
  ];
  const summaries = [summary(1, "2026-01-01", null), summary(3, "2025-08-20", null), summary(4, "2025-08-01", null)];
  assert.deepEqual(
    compute(vehicle(), types, summaries).map((i) => i.status),
    ["Overdue", "Upcoming", "NeverDone", "OK"],
  );
});
