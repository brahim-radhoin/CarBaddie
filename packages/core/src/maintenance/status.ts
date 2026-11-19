import type { UpcomingMaintenanceItemData } from "../types";

export type DueStatus = UpcomingMaintenanceItemData["status"];

/**
 * How each due-date status is worded in both apps. The engine's own `message` ("Overdue by 12 days")
 * says when; this says which bucket. One list so the phone and the desktop never use different words.
 */
export const STATUS_LABEL: Record<DueStatus, string> = {
  Overdue: "Overdue",
  Upcoming: "Due soon",
  NeverDone: "Not done yet",
  NoInterval: "No interval",
  OK: "On track",
};

/** "Up to date, 12 on track" / "1 overdue, 2 due soon, 9 on track": the one-line summary under a vehicle. */
export function summariseStatuses(items: { status: DueStatus }[]): string {
  const count = (s: DueStatus) => items.filter((i) => i.status === s).length;
  const overdue = count("Overdue");
  const soon = count("Upcoming");
  const ok = count("OK");
  if (overdue === 0 && soon === 0) return ok > 0 ? `Up to date, ${ok} on track` : "Nothing due yet";
  return [overdue ? `${overdue} overdue` : null, soon ? `${soon} due soon` : null, `${ok} on track`]
    .filter(Boolean)
    .join(", ");
}
