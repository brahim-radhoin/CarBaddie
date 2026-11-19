// Calendar dates as "YYYY-MM-DD" strings, always in local time (never `toISOString()`, which is
// UTC and names yesterday's date for the first hours of a day east of Greenwich).

const pad = (n: number) => String(n).padStart(2, "0");

/** `m` is 0-based. */
export function toISO(y: number, m: number, d: number): string {
  return `${y}-${pad(m + 1)}-${pad(d)}`;
}

/** `m` is 0-based. Returns null for anything that is not a real calendar date. */
export function parseISO(s: string): { y: number; m: number; d: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]) - 1;
  const d = Number(match[3]);
  const check = new Date(y, m, d);
  if (check.getFullYear() !== y || check.getMonth() !== m || check.getDate() !== d) return null;
  return { y, m, d };
}

/** Today in local time. `now` is injectable for tests. */
export function todayISO(now: Date = new Date()): string {
  return toISO(now.getFullYear(), now.getMonth(), now.getDate());
}

export function addDaysISO(iso: string, days: number): string {
  const p = parseISO(iso) ?? parseISO(todayISO())!;
  const d = new Date(p.y, p.m, p.d + days);
  return toISO(d.getFullYear(), d.getMonth(), d.getDate());
}

/** "Nov 18, 2026" in the user's language and order; "November 18, 2026" with `long`. */
export function formatISO(iso: string, style: "short" | "long" = "short"): string {
  const p = parseISO(iso);
  if (!p) return iso;
  return new Date(p.y, p.m, p.d).toLocaleDateString(undefined, {
    day: "numeric",
    month: style === "long" ? "long" : "short",
    year: "numeric",
  });
}

/** Whole days from `from` to `to` (negative when `to` is earlier). Ignores daylight-saving shifts. */
export function daysBetweenISO(from: string, to: string): number | null {
  const a = parseISO(from);
  const b = parseISO(to);
  if (!a || !b) return null;
  return Math.round((Date.UTC(b.y, b.m, b.d) - Date.UTC(a.y, a.m, a.d)) / 86_400_000);
}
