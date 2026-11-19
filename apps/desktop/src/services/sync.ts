// Device-to-device sync through the user's Google Drive (engine: @carbaddie/core sync/engine.ts).
import { createDriveTransport, getSyncProblem, SYNC_SETTING_KEYS, type SyncProblem, type SyncResult } from "@carbaddie/core";
import { openDatabase } from "../db";
import { getAccessToken } from "./googleDrive";

/** Fired on `window` after every successful sync. */
export const SYNCED_EVENT = "carbaddie:synced";
/** Fired on `window` after a sync that failed (the Sync settings show why). */
export const SYNC_FAILED_EVENT = "carbaddie:sync-failed";

const transport = createDriveTransport({ getAccessToken });

export async function syncNow(): Promise<SyncResult> {
  try {
    const result = await (await openDatabase()).sync(transport);
    window.dispatchEvent(new CustomEvent(SYNCED_EVENT, { detail: result }));
    return result;
  } catch (error) {
    window.dispatchEvent(new CustomEvent(SYNC_FAILED_EVENT));
    throw error;
  }
}

/** After signing in (maybe to another account): send everything again on the next sync. */
export async function resetSyncProgress(): Promise<void> {
  await (await openDatabase()).resetSync();
}

export async function getLastSyncTime(): Promise<string | null> {
  return (await openDatabase()).repo.getSetting(SYNC_SETTING_KEYS.lastSuccess);
}

/** A failed last sync, or a device on a newer version; null when all is well. */
export async function getLastSyncProblem(): Promise<SyncProblem | null> {
  return getSyncProblem((await openDatabase()).repo);
}
