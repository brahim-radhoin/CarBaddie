// What the user should know about sync after the last run, in the same words on both apps.
// The engine records the outcome in app_settings (engine.ts `recordOutcome`); the apps show this.

import { SYNC_SETTING_KEYS } from "./engine.ts";

export interface SyncProblem {
  /**
   * "failed": the last sync stopped with an error (shown in the danger colour).
   * "blocked": a device runs a newer app whose files this one can't read (shown in the warn colour).
   */
  kind: "failed" | "blocked";
  text: string;
}

export const SYNC_BLOCKED_TEXT = "Update CarBaddie to get changes from a device on a newer version";

/** Null when the last sync went through and every device's files could be read. */
export async function getSyncProblem(settings: { getSetting(key: string): Promise<string | null> }): Promise<SyncProblem | null> {
  const error = await settings.getSetting(SYNC_SETTING_KEYS.lastError);
  if (error) return { kind: "failed", text: `Last sync failed: ${error}` };
  let blocked: unknown = null;
  try {
    blocked = JSON.parse((await settings.getSetting(SYNC_SETTING_KEYS.blocked)) ?? "null");
  } catch {
    // Unreadable: treat as nothing blocked; the next sync rewrites it.
  }
  return Array.isArray(blocked) && blocked.length > 0 ? { kind: "blocked", text: SYNC_BLOCKED_TEXT } : null;
}
