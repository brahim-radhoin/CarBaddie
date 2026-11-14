import { useEffect } from "react";
import { checkReminders, getRemindersEnabled, reminderNotifications } from "@carbaddie/core";
import { isPermissionGranted, requestPermission, sendNotification } from "@tauri-apps/plugin-notification";
import { getRepository } from "../db";
import { SYNCED_EVENT } from "../services/sync";

const PERIOD_MS = 6 * 60 * 60_000;

// Asked at most once per run; a refusal leaves reminders un-notified until it is allowed.
let permission: Promise<boolean> | null = null;
const notificationsAllowed = () =>
  (permission ??= (async () => (await isPermissionGranted()) || (await requestPermission()) === "granted")());

let queue: Promise<void> = Promise.resolve();

/**
 * Notifies services that became due soon or overdue since the last check (see
 * @carbaddie/core maintenance/reminders.ts). Checks run one at a time; does nothing while
 * "Maintenance reminders" is off.
 */
export function checkRemindersNow(): Promise<void> {
  queue = queue.catch(() => undefined).then(async () => {
    const repo = await getRepository();
    if (!(await getRemindersEnabled(repo))) return;
    await checkReminders(repo, {
      notify: async (reminders) => {
        if (!(await notificationsAllowed())) throw new Error("Notifications are not allowed for CarBaddie.");
        for (const notification of reminderNotifications(reminders)) sendNotification(notification);
      },
    });
  });
  return queue;
}

/** Reminder checks once the database is open: at start, after each sync and every 6 hours. */
export function useReminders(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    const run = () => void checkRemindersNow().catch((error) => console.warn("Reminder check failed:", error));
    run();
    const interval = setInterval(run, PERIOD_MS);
    window.addEventListener(SYNCED_EVENT, run);
    return () => {
      clearInterval(interval);
      window.removeEventListener(SYNCED_EVENT, run);
    };
  }, [enabled]);
}
