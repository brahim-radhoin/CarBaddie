// Device-to-device sync through the user's Google Drive (engine: @carbaddie/core sync/engine.ts).
import { createDriveTransport, SYNC_SETTING_KEYS, type SyncResult } from "@carbaddie/core";
import { openDatabase } from "../db";
import { getAccessToken } from "./googleDrive";

/** Fired on `window` after every successful sync. */
export const SYNCED_EVENT = "carbaddie:synced";

const transport = createDriveTransport({ getAccessToken });

export async function syncNow(): Promise<SyncResult> {
  const result = await (await openDatabase()).sync(transport);
  window.dispatchEvent(new CustomEvent(SYNCED_EVENT, { detail: result }));
  return result;
}

/** After signing in (maybe to another account): send everything again on the next sync. */
export async function resetSyncProgress(): Promise<void> {
  await (await openDatabase()).resetSync();
}

export async function getLastSyncTime(): Promise<string | null> {
  return (await openDatabase()).repo.getSetting(SYNC_SETTING_KEYS.lastSuccess);
}
