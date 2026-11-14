// Maintenance reminders: which due-date engine results deserve a notification, and which of
// those this device has already shown. Each app only delivers them (Tauri / expo-notifications).
//
// A reminder's `key` names one due occurrence: vehicle, service type, status and the due date
// and/or mileage. The same occurrence is never notified twice; logging the service (or changing
// its interval) moves the due point, which gives a new key and so a new reminder next cycle.

import { computeUpcomingMaintenance } from "./upcoming.ts";
import type { Repository } from "../db/repository";
import type { DistanceUnit, Id, ServiceTypeLogSummary, ServiceTypeRead, VehicleRead } from "../types";

/** Device-local app_settings keys (not synced: each device shows its own notifications). */
export const REMINDER_SETTING_KEYS = {
  /** "false" turns reminders off; anything else (or unset) means on. */
  enabled: "reminders.enabled",
  /** JSON array of the keys of reminders already notified that are still active. */
  notified: "reminders.notified",
} as const;

export type ReminderStatus = "Overdue" | "Upcoming";

export interface Reminder {
  /** Identifies this due occurrence (see the file comment). */
  key: string;
  vehicleId: Id;
  serviceTypeId: Id;
  status: ReminderStatus;
  vehicleName: string;
  serviceTypeName: string;
  /** Local due date "YYYY-MM-DD" when the service has a time interval. */
  dueDate: string | null;
  /** Due odometer reading in km when the service has a distance interval. */
  dueKm: number | null;
  title: string;
  body: string;
}

export interface ComputeRemindersInput {
  vehicles: VehicleRead[];
  /** Per vehicle id, as returned by `repo.getServiceTypeSummaries`. */
  summariesByVehicle: Record<Id, ServiceTypeLogSummary[]>;
  serviceTypes: ServiceTypeRead[];
  today?: Date;
  distanceUnit?: DistanceUnit;
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function localMidnight(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function isoDate(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/**
 * The due date the engine's `remainingDays` points at. The engine rounds the gap between two
 * local midnights up, which counts one day too many across a DST change in autumn; taking the
 * earliest date that gives the same count keeps the key stable before and after the change.
 */
function dueDateFor(today: Date, remainingDays: number): string {
  const dayBefore = addDays(today, remainingDays - 1);
  const countForDayBefore = Math.ceil((dayBefore.getTime() - today.getTime()) / MS_PER_DAY);
  return isoDate(countForDayBefore === remainingDays ? dayBefore : addDays(today, remainingDays));
}

export function reminderKey(r: Pick<Reminder, "vehicleId" | "serviceTypeId" | "status" | "dueDate" | "dueKm">): string {
  return [r.vehicleId, r.serviceTypeId, r.status, r.dueDate ?? "", r.dueKm ?? ""].join("|");
}

export function vehicleDisplayName(vehicle: Pick<VehicleRead, "make" | "model">): string {
  return `${vehicle.make} ${vehicle.model}`.trim();
}

/** Overdue and upcoming services of every vehicle, as notifications. Never-done services are left out. */
export function computeReminders({
  vehicles,
  summariesByVehicle,
  serviceTypes,
  today: todayInput,
  distanceUnit = "km",
}: ComputeRemindersInput): Reminder[] {
  const today = localMidnight(todayInput ?? new Date());
  const reminders: Reminder[] = [];
  for (const vehicle of vehicles) {
    const items = computeUpcomingMaintenance({
      vehicle,
      serviceTypeSummaries: summariesByVehicle[vehicle.id] ?? [],
      allServiceTypes: serviceTypes,
      today,
      distanceUnit,
    });
    const vehicleName = vehicleDisplayName(vehicle);
    for (const item of items) {
      if (item.status !== "Overdue" && item.status !== "Upcoming") continue;
      const byDate = item.details?.byDate;
      const base = {
        vehicleId: vehicle.id,
        serviceTypeId: item.serviceTypeId,
        status: item.status,
        dueDate: byDate ? dueDateFor(today, byDate.remainingDays) : null,
        dueKm: item.details?.byMileage?.due ?? null,
      };
      reminders.push({
        ...base,
        key: reminderKey(base),
        vehicleName,
        serviceTypeName: item.serviceTypeName,
        title: `${item.serviceTypeName} ${item.status === "Overdue" ? "overdue" : "due soon"}`,
        body: `${vehicleName}: ${item.message}`,
      });
    }
  }
  return reminders;
}

/**
 * Splits current reminders into the ones not notified yet and the keys to store afterwards:
 * only keys still active are kept, so the stored list doesn't grow forever.
 */
export function pickNewReminders(
  reminders: Reminder[],
  notifiedKeys: Iterable<string>,
): { toNotify: Reminder[]; keep: string[] } {
  const notified = new Set(notifiedKeys);
  const seen = new Set<string>();
  const toNotify: Reminder[] = [];
  for (const r of reminders) {
    if (seen.has(r.key)) continue;
    seen.add(r.key);
    if (!notified.has(r.key)) toNotify.push(r);
  }
  return { toNotify, keep: [...seen] };
}

/**
 * Notifications for a batch of new reminders: one each, or a single summary when there are
 * more than `max` (the first check on a device can find many overdue services at once).
 */
export function reminderNotifications(reminders: Reminder[], max = 3): { title: string; body: string }[] {
  if (reminders.length <= max) return reminders.map(({ title, body }) => ({ title, body }));
  const overdue = reminders.filter((r) => r.status === "Overdue").length;
  const upcoming = reminders.length - overdue;
  const counts = [overdue ? `${overdue} overdue` : "", upcoming ? `${upcoming} due soon` : ""].filter(Boolean);
  const lines = reminders.slice(0, max).map((r) => `${r.vehicleName}: ${r.title}`);
  lines.push(`and ${reminders.length - max} more`);
  return [{ title: `Maintenance: ${counts.join(", ")}`, body: lines.join("\n") }];
}

/** Reminders for everything in the repository, in the user's distance unit. */
export async function collectReminders(repo: Repository, today: Date = new Date()): Promise<Reminder[]> {
  const [vehicles, serviceTypes, preferences] = await Promise.all([
    repo.getAllVehicles(),
    repo.getAllServiceTypes(),
    repo.getPreferences(),
  ]);
  const summariesByVehicle: Record<Id, ServiceTypeLogSummary[]> = {};
  for (const v of vehicles) summariesByVehicle[v.id] = await repo.getServiceTypeSummaries(v.id);
  return computeReminders({ vehicles, summariesByVehicle, serviceTypes, today, distanceUnit: preferences.distance_unit });
}

export async function getRemindersEnabled(repo: Repository): Promise<boolean> {
  return (await repo.getSetting(REMINDER_SETTING_KEYS.enabled)) !== "false";
}

export function setRemindersEnabled(repo: Repository, enabled: boolean): Promise<void> {
  return repo.setSetting(REMINDER_SETTING_KEYS.enabled, String(enabled));
}

export async function getNotifiedReminderKeys(repo: Repository): Promise<string[]> {
  try {
    const parsed: unknown = JSON.parse((await repo.getSetting(REMINDER_SETTING_KEYS.notified)) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((k): k is string => typeof k === "string") : [];
  } catch {
    return [];
  }
}

export function setNotifiedReminderKeys(repo: Repository, keys: string[]): Promise<void> {
  return repo.setSetting(REMINDER_SETTING_KEYS.notified, JSON.stringify(keys));
}

export interface CheckRemindersOptions {
  /** Shows the new reminders; if it throws, they stay un-notified and come back next check. */
  notify: (reminders: Reminder[]) => Promise<void>;
  /** Keys to treat as already notified (mobile: date notifications that have already fired). */
  alsoNotified?: Iterable<string>;
  today?: Date;
}

/**
 * One reminder pass: collect, notify the new ones, remember what was notified.
 * Doesn't look at `reminders.enabled`; callers check `getRemindersEnabled` first.
 * Returns every active reminder.
 */
export async function checkReminders(
  repo: Repository,
  { notify, alsoNotified = [], today = new Date() }: CheckRemindersOptions,
): Promise<Reminder[]> {
  const reminders = await collectReminders(repo, today);
  const { toNotify, keep } = pickNewReminders(reminders, [...(await getNotifiedReminderKeys(repo)), ...alsoNotified]);
  if (toNotify.length) await notify(toNotify);
  await setNotifiedReminderKeys(repo, keep);
  return reminders;
}
