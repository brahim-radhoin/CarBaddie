// Input rules for user edits, checked by the repository before writing. Backup imports and sync
// are not checked here: backup/format.ts normalises old files instead of rejecting them, and
// sync takes what other devices wrote (writers are strict, readers accept anything).
//
// Dates must be real calendar dates. Visit, log, odometer and acquisition dates can't be later
// than today, nor before the vehicle could exist: model years go on sale the year before, so a
// 2019 model can have history from 1 January 2018. The repository checks only what an edit
// changes, so an old record that breaks a newer rule can still have its notes edited.

import { formatISO, parseISO } from "./dates.ts";
import { isZoneId } from "./maintenance/zones.ts";

/** The first model year: anything earlier is a typo. */
export const FIRST_MODEL_YEAR = 1886;
/** Readings above this many km are typos (an extra zero), not odometers. */
export const MAX_MILEAGE_KM = 2_000_000;
const MAX_INTERVAL_KM = 1_000_000;
const MAX_INTERVAL_DAYS = 36_500;
const MAX_NAME = 80;
const MAX_SHORT_TEXT = 500;
const MAX_NOTES = 5000;

/** The first day a vehicle of this model year can have history, or null when the year is unknown. */
export function vehicleStartDate(year: number | null | undefined): string | null {
  return year != null && Number.isInteger(year) && year >= FIRST_MODEL_YEAR ? `${year - 1}-01-01` : null;
}

/** The newest model year a vehicle can have today (next year's models are already on sale). */
export function latestModelYear(today: string): number {
  return (parseISO(today)?.y ?? new Date().getFullYear()) + 1;
}

/** What date rules need to know: today (injected, for tests) and the vehicle's model year. */
export interface DateContext {
  today: string;
  year?: number | null;
}

/** Thrown for invalid user input. `fieldErrors` maps a field name to its messages. */
export class ValidationError extends Error {
  readonly fieldErrors: Record<string, string[]>;

  constructor(fieldErrors: Record<string, string[]>) {
    super(Object.values(fieldErrors).flat().join(" ") || "Invalid input");
    this.name = "ValidationError";
    this.fieldErrors = fieldErrors;
  }
}

/** 11–17 characters, digits and capital letters except I, O and Q. */
const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{11,17}$/;

/** VINs are case-insensitive; store them trimmed and upper-case, or null when empty. */
export function normaliseVin(vin: string | null | undefined): string | null {
  const v = vin?.trim().toUpperCase();
  return v ? v : null;
}

class Checker {
  readonly errors: Record<string, string[]> = {};

  add(field: string, message: string) {
    (this.errors[field] ??= []).push(message);
  }

  required(field: string, value: unknown) {
    if (typeof value !== "string" || !value.trim()) this.add(field, "This field is required.");
  }

  nonNegativeInt(field: string, value: unknown, max = Number.MAX_SAFE_INTEGER, tooHigh = "That number is too large.") {
    if (value === null || value === undefined) return;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) this.add(field, "Must be a whole number of 0 or more.");
    else if (value > max) this.add(field, tooHigh);
  }

  mileage(field: string, value: unknown) {
    this.nonNegativeInt(field, value, MAX_MILEAGE_KM, "That odometer reading is too high to be right.");
  }

  maxLength(field: string, value: unknown, max: number) {
    if (typeof value === "string" && value.trim().length > max) this.add(field, `Keep it to ${max.toLocaleString("en-US")} characters or fewer.`);
  }

  /** A history date: real, not later than today, not before the vehicle could exist. Empty values are left to `required`. */
  historyDate(field: string, label: string, value: unknown, ctx: DateContext | undefined) {
    if (value === null || value === undefined || value === "") return;
    if (typeof value !== "string" || !parseISO(value)) {
      this.add(field, `${label} isn't a real date.`);
      return;
    }
    if (!ctx) return;
    if (value.trim() > ctx.today) this.add(field, `${label} can't be later than today.`);
    const start = vehicleStartDate(ctx.year);
    if (start && value.trim() < start) this.add(field, `${label} can't be before ${ctx.year! - 1}: a ${ctx.year} model wasn't built yet.`);
  }

  done() {
    if (Object.keys(this.errors).length) throw new ValidationError(this.errors);
  }
}

interface VehicleInput {
  make?: string;
  model?: string;
  year?: number | null;
  vin?: string | null;
  initial_mileage?: number | null;
  acquisition_date?: string | null;
  body_type?: string | null;
}

/** What a vehicle's dates are checked against. `year` is the model year after the edit. */
export interface VehicleContext extends DateContext {
  /** The oldest date in its history (visits, odometer readings, acquisition), when the year changes. */
  earliestRecord?: string | null;
}

/** `partial`: only check fields that are present (updates). */
export function validateVehicle(data: VehicleInput, partial = false, ctx?: VehicleContext): void {
  const c = new Checker();
  for (const field of ["make", "model"] as const) {
    if (!partial || data[field] !== undefined) c.required(field, data[field]);
    c.maxLength(field, data[field], 60);
  }
  const vin = normaliseVin(data.vin);
  if (vin && !VIN_PATTERN.test(vin)) {
    c.add("vin", "A VIN has 11 to 17 letters and digits (no I, O or Q).");
  }
  c.nonNegativeInt("year", data.year);
  if (ctx && typeof data.year === "number" && Number.isInteger(data.year)) {
    const latest = latestModelYear(ctx.today);
    if (data.year < FIRST_MODEL_YEAR || data.year > latest) c.add("year", `Enter a year from ${FIRST_MODEL_YEAR} to ${latest}.`);
    else {
      const start = vehicleStartDate(data.year);
      if (start && ctx.earliestRecord && ctx.earliestRecord < start) {
        c.add("year", `Its history goes back to ${formatISO(ctx.earliestRecord)}, before a ${data.year} model was built.`);
      }
    }
  }
  c.mileage("initial_mileage", data.initial_mileage);
  c.historyDate("acquisition_date", "The acquisition date", data.acquisition_date, ctx);
  // Writers are strict (a short lowercase id); readers accept anything a newer app wrote.
  if (data.body_type != null && !/^[a-z][a-z0-9_-]{0,39}$/.test(data.body_type)) c.add("body_type", "Not a valid vehicle type.");
  c.done();
}

export function validateServiceType(
  data: {
    name?: string;
    recommended_interval_km?: number | null;
    recommended_interval_days?: number | null;
    zone?: string | null;
    fields?: { name: string; unit?: string | null }[];
  },
  partial = false,
): void {
  const c = new Checker();
  if (!partial || data.name !== undefined) c.required("name", data.name);
  c.maxLength("name", data.name, MAX_NAME);
  c.nonNegativeInt("recommended_interval_km", data.recommended_interval_km, MAX_INTERVAL_KM, "That interval is too long.");
  c.nonNegativeInt("recommended_interval_days", data.recommended_interval_days, MAX_INTERVAL_DAYS, "That interval is too long.");
  // Writers are strict; a part a newer app wrote is kept because forms only send a part the user picked.
  if (data.zone != null && !isZoneId(data.zone)) c.add("zone", "Not a part of the vehicle this app knows.");
  data.fields?.forEach((f, i) => {
    c.maxLength(`fields.${i}.name`, f.name, 60);
    c.maxLength(`fields.${i}.unit`, f.unit, 60);
  });
  c.done();
}

export function validateMaintenanceLog(
  data: { date?: string; mileage?: number; cost_cents?: number; notes?: string | null },
  partial = false,
  ctx?: DateContext,
): void {
  const c = new Checker();
  if (!partial || data.date !== undefined) c.required("date", data.date);
  c.historyDate("date", "The date", data.date, ctx);
  if (!partial && data.mileage === undefined) c.add("mileage", "This field is required.");
  c.mileage("mileage", data.mileage);
  c.nonNegativeInt("cost_cents", data.cost_cents);
  c.maxLength("notes", data.notes, MAX_NOTES);
  c.done();
}

export function validateOdometerReading(data: { date?: string; mileage?: number | null; note?: string | null }, partial = false, ctx?: DateContext): void {
  const c = new Checker();
  if (!partial || data.date !== undefined) c.required("date", data.date);
  c.historyDate("date", "The date", data.date, ctx);
  if (data.mileage === null || (!partial && data.mileage === undefined)) c.add("mileage", "This field is required.");
  c.mileage("mileage", data.mileage);
  c.maxLength("note", data.note, MAX_SHORT_TEXT);
  c.done();
}

/** `partial`: only check header fields that are present (updates); `items`, when present, must not be empty. */
export function validateServiceEvent(
  data: {
    date?: string;
    mileage?: number;
    shop?: string | null;
    notes?: string | null;
    items?: { cost_cents?: number; notes?: string | null }[];
  },
  partial = false,
  ctx?: DateContext,
): void {
  const c = new Checker();
  if (!partial || data.date !== undefined) c.required("date", data.date);
  c.historyDate("date", "The date", data.date, ctx);
  if (!partial && data.mileage === undefined) c.add("mileage", "This field is required.");
  c.mileage("mileage", data.mileage);
  c.maxLength("shop", data.shop, MAX_NAME);
  c.maxLength("notes", data.notes, MAX_NOTES);
  if ((!partial || data.items !== undefined) && !data.items?.length) c.add("items", "Add at least one service.");
  data.items?.forEach((item, i) => {
    if (item.cost_cents === undefined) c.add(`items.${i}.cost_cents`, "This field is required.");
    c.nonNegativeInt(`items.${i}.cost_cents`, item.cost_cents);
    c.maxLength(`items.${i}.notes`, item.notes, MAX_NOTES);
  });
  c.done();
}

/** A custom field value as typed: a number, a real date, yes/no, or text of a sensible length. */
export function fieldValueProblem(fieldType: string, value: string): string | null {
  const v = value.trim();
  if (v === "") return null;
  switch (fieldType) {
    case "number":
      return /^[-+]?(\d+([.,]\d+)?|[.,]\d+)$/.test(v) ? null : "enter a number";
    case "date":
      return parseISO(v) ? null : "pick a real date";
    case "boolean":
      return v === "true" || v === "false" ? null : "choose yes or no";
    default:
      return v.length > MAX_SHORT_TEXT ? `keep it to ${MAX_SHORT_TEXT} characters or fewer` : null;
  }
}

/** Checks values against their fields' types. Pass only values the edit adds or changes. */
export function validateFieldValues(values: readonly { field_id: string; value: string; name: string; field_type: string }[]): void {
  const c = new Checker();
  for (const v of values) {
    const problem = fieldValueProblem(v.field_type, v.value);
    if (problem) c.add(`custom_field_values.${v.field_id}`, `${v.name}: ${problem}.`);
  }
  c.done();
}

export function validatePreference(key: string, value: string): void {
  const c = new Checker();
  if (key === "currency" && !/^[A-Z]{3}$/.test(value)) c.add(key, "Use a three-letter currency code, e.g. EUR.");
  else if (key === "distance_unit" && value !== "km" && value !== "mi") c.add(key, "Use km or mi.");
  else if (key !== "currency" && key !== "distance_unit") c.add(key, "Unknown preference.");
  c.done();
}

/** The garage order: distinct vehicle ids. Readers accept anything (see getGarageOrder). */
export function validateGarageOrder(ids: unknown): asserts ids is string[] {
  const c = new Checker();
  if (!Array.isArray(ids) || ids.length > 10_000 || !ids.every((id) => typeof id === "string" && id.length > 0 && id.length <= 64)) {
    c.add("garage_order", "Use a list of vehicle ids.");
  } else if (new Set(ids).size !== ids.length) {
    c.add("garage_order", "A vehicle can only be in the order once.");
  }
  c.done();
}

export function validateIntervalOverride(data: { override_interval_km?: number | null; override_interval_days?: number | null }): void {
  const c = new Checker();
  c.nonNegativeInt("override_interval_km", data.override_interval_km, MAX_INTERVAL_KM, "That interval is too long.");
  c.nonNegativeInt("override_interval_days", data.override_interval_days, MAX_INTERVAL_DAYS, "That interval is too long.");
  c.done();
}

/**
 * A warning, not a rule: the reading that makes this one look wrong, i.e. a lower mileage on a
 * later date or a higher one on an earlier date. Odometers get replaced and old entries have
 * typos, so forms show it and still let the user save. `records` are the vehicle's other dated
 * readings (visits, logs, odometer readings); leave out the one being edited.
 */
export function odometerConflict(
  date: string,
  mileageKm: number,
  records: readonly { date: string; mileage: number }[],
): { date: string; mileage: number; kind: "higher-before" | "lower-after" } | null {
  if (!parseISO(date) || !Number.isFinite(mileageKm)) return null;
  // The nearest offending reading is the clearest one to name.
  let before: { date: string; mileage: number } | null = null;
  let after: { date: string; mileage: number } | null = null;
  for (const r of records) {
    if (r.date < date && r.mileage > mileageKm && (!before || r.date > before.date)) before = r;
    if (r.date > date && r.mileage < mileageKm && (!after || r.date < after.date)) after = r;
  }
  if (before) return { date: before.date, mileage: before.mileage, kind: "higher-before" };
  if (after) return { date: after.date, mileage: after.mileage, kind: "lower-after" };
  return null;
}

/** The warning both apps show under the odometer field, e.g. "Lower than 45,000 km on Mar 3, 2025". */
export function describeOdometerConflict(
  conflict: { date: string; mileage: number; kind: "higher-before" | "lower-after" },
  distance: (km: number) => string,
): string {
  return `${conflict.kind === "higher-before" ? "Lower" : "Higher"} than ${distance(conflict.mileage)} on ${formatISO(conflict.date)}`;
}

/** A vehicle's dated readings for `odometerConflict`, without the visit, log or reading being edited. */
export function odometerRecords(
  vehicle: {
    maintenance_logs: readonly { id: string; event_id?: string | null; date: string; mileage: number }[];
    odometer_readings: readonly { id: string; date: string; mileage: number }[];
  },
  skip: { visitId?: string; logId?: string; readingId?: string } = {},
): { date: string; mileage: number }[] {
  const logs = vehicle.maintenance_logs.filter(
    (l) => !(skip.visitId && (l.event_id === skip.visitId || l.id === skip.visitId)) && l.id !== skip.logId,
  );
  const readings = vehicle.odometer_readings.filter((r) => r.id !== skip.readingId);
  return [...logs, ...readings].map((r) => ({ date: r.date, mileage: r.mileage }));
}

/** Whole numbers as people type them: "45000", "45 000", "45,000", "45.000". Null for anything else. */
export function parseWholeNumber(input: string): number | null {
  const s = input.trim().replace(/[\s  ]/g, "");
  if (/^\d+$/.test(s)) return Number(s);
  if (/^\d{1,3}([,.'’]\d{3})+$/.test(s)) return Number(s.replace(/[,.'’]/g, ""));
  return null;
}
