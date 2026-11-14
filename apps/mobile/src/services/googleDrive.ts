// Google account connection and device-to-device sync through the user's Google Drive
// (engine: @carbaddie/core sync/engine.ts, files in Drive's hidden appDataFolder).
//
// Sign-in is Android's native Google account picker (@react-native-google-signin). Google Play
// services keeps the access token fresh, so no token is stored by the app. The Android OAuth
// client (package + signing SHA-1) must live in the same Google Cloud project as the desktop
// client, because appDataFolder is per project.
import {
  GoogleSignin,
  isErrorWithCode,
  isSuccessResponse,
  statusCodes,
} from "@react-native-google-signin/google-signin";
import { createDriveTransport, DRIVE_APPDATA_SCOPE, SYNC_SETTING_KEYS, type SyncResult } from "@carbaddie/core";
import { getDatabase } from "../db/schema";
import * as repo from "../db/repository";

export interface GoogleDriveStatus {
  isConnected: boolean;
  email?: string;
  lastSyncTime?: string;
  autoSyncEnabled: boolean;
}

const SETTING_EMAIL = "gdrive_user_email";
const SETTING_AUTO_SYNC = "gdrive_auto_sync";
/** Settings older versions used for the implicit-flow token and the backup-file sync. */
const LEGACY_SETTINGS = ["gdrive_access_token", "gdrive_last_backup_time", "gdrive_file_id", "gdrive_client_id"];

GoogleSignin.configure({ scopes: [DRIVE_APPDATA_SCOPE] });

/** Thrown when there is no usable Google sign-in. */
export class NotConnectedError extends Error {
  constructor(message = "Google Drive is not connected. Sign in with Google first.") {
    super(message);
    this.name = "NotConnectedError";
  }
}

let legacyCleanup: Promise<void> | null = null;
const removeLegacySettings = () =>
  (legacyCleanup ??= Promise.all(LEGACY_SETTINGS.map((key) => repo.removeSetting(key))).then(() => undefined));

let lastToken: string | null = null;

/** A valid access token; with `forceRefresh`, a new one (the Drive transport asks after a 401). */
export async function getAccessToken(forceRefresh = false): Promise<string> {
  if (!GoogleSignin.getCurrentUser()) {
    try {
      const silent = await GoogleSignin.signInSilently();
      if (silent.type !== "success") throw new NotConnectedError();
    } catch (e) {
      if (e instanceof NotConnectedError) throw e;
      throw new NotConnectedError(`Google sign-in needs to be renewed. Sign in with Google again. (${(e as Error).message})`);
    }
  }
  if (forceRefresh && lastToken) await GoogleSignin.clearCachedAccessToken(lastToken);
  lastToken = (await GoogleSignin.getTokens()).accessToken;
  return lastToken;
}

export async function getGoogleDriveStatus(): Promise<GoogleDriveStatus> {
  await removeLegacySettings();
  const db = await getDatabase();
  return {
    isConnected: GoogleSignin.hasPreviousSignIn(),
    email: GoogleSignin.getCurrentUser()?.user.email ?? (await db.repo.getSetting(SETTING_EMAIL)) ?? undefined,
    lastSyncTime: (await db.repo.getSetting(SYNC_SETTING_KEYS.lastSuccess)) ?? undefined,
    autoSyncEnabled: (await db.repo.getSetting(SETTING_AUTO_SYNC)) !== "false",
  };
}

export async function setAutoSyncEnabled(enabled: boolean): Promise<void> {
  await repo.setSetting(SETTING_AUTO_SYNC, enabled ? "true" : "false");
}

export async function disconnectGoogleDrive(): Promise<void> {
  lastToken = null;
  await GoogleSignin.signOut();
  await repo.removeSetting(SETTING_EMAIL);
}

/** Opens the Google account picker and asks for access to the app's private Drive folder. */
export async function signInWithGoogle(): Promise<{ success: boolean; email?: string; error?: string }> {
  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const res = await GoogleSignin.signIn();
    if (!isSuccessResponse(res)) return { success: false }; // cancelled

    if (!res.data.scopes.includes(DRIVE_APPDATA_SCOPE)) {
      const added = await GoogleSignin.addScopes({ scopes: [DRIVE_APPDATA_SCOPE] });
      if (!added || !isSuccessResponse(added) || !added.data.scopes.includes(DRIVE_APPDATA_SCOPE)) {
        await GoogleSignin.signOut();
        return { success: false, error: "Sync needs permission to store CarBaddie's data in your Google Drive. Please allow it." };
      }
    }

    const email = res.data.user.email;
    await repo.setSetting(SETTING_EMAIL, email);
    // Possibly another account than before: send everything there on the next sync.
    await (await getDatabase()).resetSync();
    return { success: true, email };
  } catch (e) {
    if (isErrorWithCode(e)) {
      if (e.code === statusCodes.SIGN_IN_CANCELLED) return { success: false };
      if (e.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return { success: false, error: "Google Play services is missing or out of date on this phone." };
      }
      if (String(e.code) === "10" || /DEVELOPER_ERROR/.test(e.message)) {
        return {
          success: false,
          error:
            "Google rejected this app build (DEVELOPER_ERROR). The Android OAuth client must match package " +
            "com.carbaddie.mobile and this build's signing SHA-1.",
        };
      }
    }
    return { success: false, error: (e as Error).message || "Google sign-in failed." };
  }
}

// ------------------------------------------------------------------
// Sync
// ------------------------------------------------------------------

const transport = createDriveTransport({ getAccessToken });
let onRemoteChanges: (() => void) | null = null;

/** Called after a sync that changed local data (the app refreshes its queries). */
export function setRemoteChangesListener(listener: (() => void) | null): void {
  onRemoteChanges = listener;
}

const syncListeners = new Set<(result: SyncResult) => void>();

/** Called after every successful sync (reminders re-check when data changed). Returns an unsubscribe. */
export function addSyncListener(listener: (result: SyncResult) => void): () => void {
  syncListeners.add(listener);
  return () => void syncListeners.delete(listener);
}

export async function syncNow(): Promise<SyncResult> {
  const result = await (await getDatabase()).sync(transport);
  if (result.applied > 0) onRemoteChanges?.();
  syncListeners.forEach((listener) => listener(result));
  return result;
}

/** Background sync if connected and automatic sync is on. Never throws. */
export async function performAutoSync(): Promise<SyncResult | null> {
  try {
    const status = await getGoogleDriveStatus();
    if (!status.isConnected || !status.autoSyncEnabled) return null;
    return await syncNow();
  } catch (e) {
    if (!(e instanceof NotConnectedError)) console.warn("Background sync failed:", e);
    return null;
  }
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;

/** Debounced background sync after a local edit. */
export function triggerBackgroundCloudPush(): void {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => void performAutoSync(), 2500);
}
