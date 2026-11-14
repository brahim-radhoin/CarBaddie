// Input rules for user edits, checked by the repository before writing. They are the rules the
// desktop's Python backend enforced. Backup imports are not checked here: they go through
// backup/format.ts, which normalises old files instead of rejecting them.

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

  nonNegativeInt(field: string, value: unknown) {
    if (value === null || value === undefined) return;
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) this.add(field, "Must be a whole number of 0 or more.");
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
}

/** `partial`: only check fields that are present (updates). */
export function validateVehicle(data: VehicleInput, partial = false): void {
  const c = new Checker();
  for (const field of ["make", "model"] as const) {
    if (!partial || data[field] !== undefined) c.required(field, data[field]);
  }
  const vin = normaliseVin(data.vin);
  if (vin && !VIN_PATTERN.test(vin)) {
    c.add("vin", "A VIN has 11 to 17 letters and digits (no I, O or Q).");
  }
  c.nonNegativeInt("year", data.year);
  c.nonNegativeInt("initial_mileage", data.initial_mileage);
  c.done();
}

export function validateServiceType(
  data: { name?: string; recommended_interval_km?: number | null; recommended_interval_days?: number | null },
  partial = false,
): void {
  const c = new Checker();
  if (!partial || data.name !== undefined) c.required("name", data.name);
  c.nonNegativeInt("recommended_interval_km", data.recommended_interval_km);
  c.nonNegativeInt("recommended_interval_days", data.recommended_interval_days);
  c.done();
}

export function validateMaintenanceLog(
  data: { date?: string; mileage?: number; cost_cents?: number },
  partial = false,
): void {
  const c = new Checker();
  if (!partial || data.date !== undefined) c.required("date", data.date);
  if (!partial && data.mileage === undefined) c.add("mileage", "This field is required.");
  c.nonNegativeInt("mileage", data.mileage);
  c.nonNegativeInt("cost_cents", data.cost_cents);
  c.done();
}

/** `partial`: only check header fields that are present (updates); `items`, when present, must not be empty. */
export function validateServiceEvent(
  data: { date?: string; mileage?: number; items?: { cost_cents?: number }[] },
  partial = false,
): void {
  const c = new Checker();
  if (!partial || data.date !== undefined) c.required("date", data.date);
  if (!partial && data.mileage === undefined) c.add("mileage", "This field is required.");
  c.nonNegativeInt("mileage", data.mileage);
  if ((!partial || data.items !== undefined) && !data.items?.length) c.add("items", "Add at least one service.");
  data.items?.forEach((item, i) => {
    if (item.cost_cents === undefined) c.add(`items.${i}.cost_cents`, "This field is required.");
    c.nonNegativeInt(`items.${i}.cost_cents`, item.cost_cents);
  });
  c.done();
}

export function validatePreference(key: string, value: string): void {
  const c = new Checker();
  if (key === "currency" && !/^[A-Z]{3}$/.test(value)) c.add(key, "Use a three-letter currency code, e.g. EUR.");
  else if (key === "distance_unit" && value !== "km" && value !== "mi") c.add(key, "Use km or mi.");
  else if (key !== "currency" && key !== "distance_unit") c.add(key, "Unknown preference.");
  c.done();
}

export function validateIntervalOverride(data: { override_interval_km?: number | null; override_interval_days?: number | null }): void {
  const c = new Checker();
  c.nonNegativeInt("override_interval_km", data.override_interval_km);
  c.nonNegativeInt("override_interval_days", data.override_interval_days);
  c.done();
}
