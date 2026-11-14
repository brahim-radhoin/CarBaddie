// Money and distance: how they are stored and how they are shown.
//
// - Distances are stored in kilometres (odometer, intervals). The distance unit preference
//   only changes what is shown and typed.
// - Money is stored as integer hundredths of the currency unit (`*_cents`), so sums are exact.
//   There is one currency for all costs, a synced preference.

import type { DistanceUnit, Preferences } from "./types";

export const KM_PER_MILE = 1.609344;

export const DEFAULT_PREFERENCES: Preferences = { currency: "USD", distance_unit: "km" };

/** Currencies offered in settings; any ISO 4217 code is accepted. */
export const COMMON_CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "CHF", "JPY", "TND", "MAD", "DZD", "AED", "SAR"] as const;

/** The currency an old per-device "currency symbol" setting meant. */
export const CURRENCY_BY_SYMBOL: Readonly<Record<string, string>> = { $: "USD", "€": "EUR", "£": "GBP" };

/** km → the unit shown, rounded to a whole number. */
export function toDisplayDistance(km: number, unit: DistanceUnit): number {
  return Math.round(unit === "mi" ? km / KM_PER_MILE : km);
}

/**
 * A distance typed in the unit shown → whole km. Pass the stored km the field started from:
 * when the typed value is still what that showed, it comes back unchanged (whole miles can't
 * hold every whole km, so converting back would otherwise move it by up to a kilometre).
 */
export function fromDisplayDistance(value: number, unit: DistanceUnit, previousKm?: number | null): number {
  if (previousKm != null && toDisplayDistance(previousKm, unit) === value) return previousKm;
  return Math.round(unit === "mi" ? value * KM_PER_MILE : value);
}

/** "12,345 km" / "7,671 mi". */
export function formatDistance(km: number, unit: DistanceUnit): string {
  return `${toDisplayDistance(km, unit).toLocaleString()} ${unit}`;
}

/** "$12.50", "12,50 €": the locale's format for the currency. */
export function formatMoney(cents: number, currency: string): string {
  const amount = cents / 100;
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`; // unknown code or no Intl currency support
  }
}

/** Cents → the plain number shown in an input ("12.5" → "12.50"; 0 → ""). */
export function centsToInput(cents: number | null | undefined): string {
  return cents ? (cents / 100).toFixed(2) : "";
}

/**
 * A typed amount → cents. Accepts "12", "12.5", "12,50" and thousands separators
 * ("1,234.56", "1.234,56"). Empty → 0. Returns null when it isn't a non-negative amount.
 */
export function parseMoney(input: string): number | null {
  let s = input.trim().replace(/[\s ']/g, "");
  if (!s) return 0;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  if (lastDot >= 0 && lastComma >= 0) {
    // Both: the later one is the decimal separator.
    s = lastDot > lastComma ? s.replace(/,/g, "") : s.replace(/\./g, "").replace(",", ".");
  } else if (lastComma >= 0) {
    // Only commas: a decimal comma unless it groups thousands ("1,234").
    s = /^\d{1,3}(,\d{3})+$/.test(s) ? s.replace(/,/g, "") : s.replace(",", ".");
  }
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

export function isCurrencyCode(value: string): boolean {
  return /^[A-Z]{3}$/.test(value);
}
