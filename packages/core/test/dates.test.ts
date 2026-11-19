import { test } from "node:test";
import assert from "node:assert/strict";
import { addDaysISO, daysBetweenISO, formatISO, parseISO, toISO, todayISO } from "../src/dates.ts";
import { STATUS_LABEL, summariseStatuses } from "../src/maintenance/status.ts";

test("parseISO accepts real dates only", () => {
  assert.deepEqual(parseISO("2026-11-18"), { y: 2026, m: 10, d: 18 });
  assert.equal(parseISO("2026-02-30"), null);
  assert.equal(parseISO("2026-13-01"), null);
  assert.equal(parseISO("18/11/2026"), null);
  assert.equal(parseISO(""), null);
});

test("todayISO is the local date, not the UTC one", () => {
  // 00:30 on 5 March in the local zone is still 4 March in UTC when the zone is east of Greenwich.
  assert.equal(todayISO(new Date(2026, 2, 5, 0, 30)), "2026-03-05");
  assert.equal(todayISO(new Date(2026, 11, 31, 23, 59)), "2026-12-31");
});

test("addDaysISO crosses month and year ends", () => {
  assert.equal(addDaysISO("2026-03-01", -1), "2026-02-28");
  assert.equal(addDaysISO("2026-12-31", 1), "2027-01-01");
  assert.equal(addDaysISO("2024-02-28", 1), "2024-02-29");
});

test("formatISO names the month and returns unparseable text unchanged", () => {
  assert.match(formatISO("2026-11-18"), /2026/);
  assert.match(formatISO("2026-11-18", "long"), /November|Nov/);
  assert.equal(formatISO("not a date"), "not a date");
  assert.equal(toISO(2026, 0, 5), "2026-01-05");
});

test("status wording is shared", () => {
  assert.equal(STATUS_LABEL.Upcoming, "Due soon");
  assert.equal(summariseStatuses([{ status: "OK" }, { status: "OK" }]), "Up to date, 2 on track");
  assert.equal(
    summariseStatuses([{ status: "Overdue" }, { status: "Upcoming" }, { status: "Upcoming" }, { status: "OK" }]),
    "1 overdue, 2 due soon, 1 on track"
  );
  assert.equal(summariseStatuses([{ status: "Upcoming" }]), "1 due soon, 0 on track");
  assert.equal(summariseStatuses([]), "Nothing due yet");
});

test("daysBetweenISO counts calendar days, across a daylight-saving change", () => {
  assert.equal(daysBetweenISO("2026-11-01", "2026-11-18"), 17);
  assert.equal(daysBetweenISO("2026-03-20", "2026-03-30"), 10);
  assert.equal(daysBetweenISO("2026-11-18", "2026-11-17"), -1);
  assert.equal(daysBetweenISO("bad", "2026-11-17"), null);
});
