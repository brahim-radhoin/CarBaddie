// Maintenance reminders as local notifications (rules: @carbaddie/core maintenance/reminders.ts).
//
// Each check notifies new overdue / due-soon services at once, and schedules one notification
// at 09:00 on the due date of each due-soon service with a date interval, so the phone tells
// you on the day even if the app isn't opened. Only notifications whose identifier starts with
// ID_PREFIX are CarBaddie's; every check cancels and reschedules exactly those.
import { Platform } from "react-native";
import * as Notifications from "expo-notifications";
import {
  checkReminders,
  getRemindersEnabled,
  reminderKey,
  reminderNotifications,
  setRemindersEnabled,
  type Reminder,
  type Repository,
} from "@carbaddie/core";
import { getRepository } from "../db/schema";

const CHANNEL_ID = "maintenance";
const ID_PREFIX = "carbaddie-reminder:";
const DUE_HOUR = 9;
/**
 * Device-local: when each scheduled due-date notification fires, by the key of the Overdue
 * reminder it stands for. Once fired, that reminder counts as notified (no second alert).
 */
const SETTING_SCHEDULED = "reminders.scheduled";
const SETTING_PERMISSION_ASKED = "reminders.permission_asked";

// Show reminders posted while the app is open, too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

let channel: Promise<unknown> | null = null;
/** Android needs the channel before it shows the permission prompt or any notification. */
const ensureChannel = () =>
  (channel ??=
    Platform.OS === "android"
      ? Notifications.setNotificationChannelAsync(CHANNEL_ID, {
          name: "Maintenance reminders",
          importance: Notifications.AndroidImportance.DEFAULT,
        })
      : Promise.resolve());

/** Asks for notification permission if it can still be asked. Resolves to whether it is granted. */
export async function requestReminderPermission(): Promise<boolean> {
  await ensureChannel();
  const current = await Notifications.getPermissionsAsync();
  if (current.granted || !current.canAskAgain) return current.granted;
  return (await Notifications.requestPermissionsAsync()).granted;
}

export async function areRemindersEnabled(): Promise<boolean> {
  return getRemindersEnabled(await getRepository());
}

/** Saves the switch; turning it on asks for permission. Resolves to whether notifications can be shown. */
export async function setRemindersOn(enabled: boolean): Promise<boolean> {
  await setRemindersEnabled(await getRepository(), enabled);
  const granted = enabled ? await requestReminderPermission() : false;
  await checkRemindersNow();
  return granted;
}

async function cancelScheduled(): Promise<void> {
  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  await Promise.all(
    scheduled
      .filter((n) => n.identifier.startsWith(ID_PREFIX))
      .map((n) => Notifications.cancelScheduledNotificationAsync(n.identifier)),
  );
}

async function loadScheduled(repo: Repository): Promise<Record<string, number>> {
  try {
    const parsed: unknown = JSON.parse((await repo.getSetting(SETTING_SCHEDULED)) ?? "{}");
    return parsed && typeof parsed === "object" ? (parsed as Record<string, number>) : {};
  } catch {
    return {};
  }
}

async function reschedule(repo: Repository, reminders: Reminder[], now: Date): Promise<void> {
  await cancelScheduled();
  const scheduled: Record<string, number> = {};
  for (const r of reminders) {
    if (r.status !== "Upcoming" || !r.dueDate) continue;
    const [year, month, day] = r.dueDate.split("-").map(Number);
    const fireAt = new Date(year, month - 1, day, DUE_HOUR);
    if (fireAt <= now) continue;
    const overdueKey = reminderKey({ ...r, status: "Overdue" });
    await Notifications.scheduleNotificationAsync({
      identifier: ID_PREFIX + overdueKey,
      content: { title: `${r.serviceTypeName} due today`, body: `${r.vehicleName}: due today`, data: { reminderKey: overdueKey } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt, channelId: CHANNEL_ID },
    });
    scheduled[overdueKey] = fireAt.getTime();
  }
  await repo.setSetting(SETTING_SCHEDULED, JSON.stringify(scheduled));
}

async function runCheck(): Promise<void> {
  const repo = await getRepository();
  if (!(await getRemindersEnabled(repo))) {
    await cancelScheduled();
    await repo.removeSetting(SETTING_SCHEDULED);
    return;
  }
  await ensureChannel();
  if (!(await repo.getSetting(SETTING_PERMISSION_ASKED))) {
    await repo.setSetting(SETTING_PERMISSION_ASKED, "true");
    await requestReminderPermission();
  }
  // Without permission nothing is shown, so nothing is marked as notified either.
  if (!(await Notifications.getPermissionsAsync()).granted) return;

  const now = new Date();
  const scheduled = await loadScheduled(repo);
  const fired = Object.keys(scheduled).filter((key) => scheduled[key] <= now.getTime());
  const reminders = await checkReminders(repo, {
    today: now,
    alsoNotified: fired,
    notify: async (batch) => {
      for (const content of reminderNotifications(batch)) {
        await Notifications.scheduleNotificationAsync({ content, trigger: { channelId: CHANNEL_ID } });
      }
    },
  });
  await reschedule(repo, reminders, now);
}

let queue: Promise<void> = Promise.resolve();

/** One reminder check at a time. */
export function checkRemindersNow(): Promise<void> {
  queue = queue.catch(() => undefined).then(runCheck);
  return queue;
}
