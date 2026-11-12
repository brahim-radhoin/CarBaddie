import * as WebBrowser from "expo-web-browser";
import * as Linking from "expo-linking";
import * as repo from "../db/repository";
import { exportBackupData, analyzeBackup, executeImport } from "../db/backup";
import type { FullBackupData } from "../types";

WebBrowser.maybeCompleteAuthSession();

export interface GoogleDriveStatus {
  isConnected: boolean;
  email?: string;
  lastBackupTime?: string;
  fileId?: string;
  autoSyncEnabled: boolean;
}

const SETTING_TOKEN = "gdrive_access_token";
const SETTING_EMAIL = "gdrive_user_email";
const SETTING_LAST_BACKUP = "gdrive_last_backup_time";
const SETTING_FILE_ID = "gdrive_file_id";
const SETTING_CLIENT_ID = "gdrive_client_id";
const SETTING_AUTO_SYNC = "gdrive_auto_sync";
const BACKUP_FILENAME = "carbaddie_backup.json";

// Default demo Google Client ID for development / testing
const DEFAULT_GOOGLE_CLIENT_ID = "58648902421-3ksgpe4l3jetkbvi5rusivmp02glltuq.apps.googleusercontent.com";

export async function getGoogleDriveStatus(): Promise<GoogleDriveStatus> {
  const token = await repo.getSetting(SETTING_TOKEN);
  const email = await repo.getSetting(SETTING_EMAIL);
  const lastBackupTime = await repo.getSetting(SETTING_LAST_BACKUP);
  const fileId = await repo.getSetting(SETTING_FILE_ID);
  const autoSync = await repo.getSetting(SETTING_AUTO_SYNC);

  return {
    isConnected: !!token,
    email: email ?? undefined,
    lastBackupTime: lastBackupTime ?? undefined,
    fileId: fileId ?? undefined,
    autoSyncEnabled: autoSync !== "false",
  };
}

export async function setGoogleDriveToken(token: string, email?: string): Promise<void> {
  await repo.setSetting(SETTING_TOKEN, token.trim());
  if (email) {
    await repo.setSetting(SETTING_EMAIL, email.trim());
  } else {
    try {
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${token.trim()}` },
      });
      if (res.ok) {
        const info = await res.json();
        if (info.email) {
          await repo.setSetting(SETTING_EMAIL, info.email);
        }
      }
    } catch {
      // Ignore if userinfo fails
    }
  }
}

export async function setAutoSyncEnabled(enabled: boolean): Promise<void> {
  await repo.setSetting(SETTING_AUTO_SYNC, enabled ? "true" : "false");
}

export async function disconnectGoogleDrive(): Promise<void> {
  await repo.removeSetting(SETTING_TOKEN);
  await repo.removeSetting(SETTING_EMAIL);
  await repo.removeSetting(SETTING_FILE_ID);
}

/**
 * 1-Tap OAuth Sign-in with Google.
 * Opens the native Google sign-in consent modal.
 */
export async function signInWithGoogle(customClientId?: string): Promise<{
  success: boolean;
  email?: string;
  error?: string;
}> {
  try {
    const savedClientId = await repo.getSetting(SETTING_CLIENT_ID);
    const clientId = customClientId || savedClientId || DEFAULT_GOOGLE_CLIENT_ID;

    if (customClientId) {
      await repo.setSetting(SETTING_CLIENT_ID, customClientId.trim());
    }

    const redirectUri = Linking.createURL("oauthredirect");
    const scopes = [
      "https://www.googleapis.com/auth/drive.file",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" ");

    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(clientId)}&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=token&` +
      `scope=${encodeURIComponent(scopes)}&` +
      `prompt=select_account`;

    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);

    if (result.type === "success" && result.url) {
      // Parse token from hash redirect
      const urlToParse = result.url.replace("#", "?");
      const parsedUrl = new URL(urlToParse);
      const accessToken = parsedUrl.searchParams.get("access_token");

      if (accessToken) {
        await setGoogleDriveToken(accessToken);
        const status = await getGoogleDriveStatus();
        return { success: true, email: status.email };
      }
    }

    return { success: false, error: "Sign-in was canceled or no token was returned." };
  } catch (e: any) {
    return { success: false, error: e.message || "Failed to launch Google Sign-In." };
  }
}

/**
 * Uploads a FullBackupData JSON payload to Google Drive.
 * Updates the existing carbaddie_backup.json if found, or creates a new one.
 */
export async function uploadBackupToGoogleDrive(
  backupData: FullBackupData
): Promise<{ fileId: string; modifiedTime: string }> {
  const token = await repo.getSetting(SETTING_TOKEN);
  if (!token) {
    throw new Error("Google Drive is not connected. Please sign in with Google first.");
  }

  const jsonString = JSON.stringify(backupData, null, 2);
  const existingFileId = await findBackupFileId(token);

  const boundary = "-------CarBaddieBoundary" + Date.now();
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelimiter = "\r\n--" + boundary + "--";

  let url: string;
  let method: string;
  let metadata: any;

  if (existingFileId) {
    url = `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=multipart`;
    method = "PATCH";
    metadata = {
      description: "CarBaddie Full Vehicle Telemetry & Maintenance Backup",
      modifiedTime: new Date().toISOString(),
    };
  } else {
    url = "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
    method = "POST";
    metadata = {
      name: BACKUP_FILENAME,
      mimeType: "application/json",
      description: "CarBaddie Full Vehicle Telemetry & Maintenance Backup",
    };
  }

  const multipartRequestBody =
    delimiter +
    "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
    JSON.stringify(metadata) +
    delimiter +
    "Content-Type: application/json\r\n\r\n" +
    jsonString +
    closeDelimiter;

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body: multipartRequestBody,
  });

  if (!res.ok) {
    if (res.status === 401) {
      await disconnectGoogleDrive();
      throw new Error("Google Drive access token expired. Please reconnect your account.");
    }
    const errorText = await res.text();
    throw new Error(`Google Drive upload failed (${res.status}): ${errorText}`);
  }

  const result = await res.json();
  const fileId = result.id || existingFileId;
  const nowIso = new Date().toISOString();

  await repo.setSetting(SETTING_FILE_ID, fileId);
  await repo.setSetting(SETTING_LAST_BACKUP, nowIso);

  return { fileId, modifiedTime: nowIso };
}

/**
 * Downloads the latest backup JSON from Google Drive.
 */
export async function downloadBackupFromGoogleDrive(): Promise<{
  backupData: FullBackupData;
  modifiedTime: string;
  fileId: string;
}> {
  const token = await repo.getSetting(SETTING_TOKEN);
  if (!token) {
    throw new Error("Google Drive is not connected. Please sign in with Google first.");
  }

  const query = encodeURIComponent(`name = '${BACKUP_FILENAME}' and trashed = false`);
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime desc`;

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!listRes.ok) {
    if (listRes.status === 401) {
      await disconnectGoogleDrive();
      throw new Error("Google Drive access token expired. Please reconnect your account.");
    }
    throw new Error("Failed to query Google Drive for backup file.");
  }

  const listData = await listRes.json();
  const file = listData.files?.[0];

  if (!file) {
    throw new Error("No 'carbaddie_backup.json' found in your Google Drive.");
  }

  const downloadUrl = `https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`;
  const dlRes = await fetch(downloadUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!dlRes.ok) {
    throw new Error(`Failed to download backup from Google Drive (${dlRes.status})`);
  }

  const content = await dlRes.text();
  const backupData: FullBackupData = JSON.parse(content);

  if (!backupData.metadata || !backupData.vehicles || !backupData.service_types) {
    throw new Error("The backup file retrieved from Google Drive is invalid or corrupted.");
  }

  return {
    backupData,
    modifiedTime: file.modifiedTime,
    fileId: file.id,
  };
}

/**
 * Background auto-sync:
 * Pulls newer cloud updates on startup or pushes local modifications silently.
 */
export async function performAutoSync(onDataUpdated?: () => void): Promise<{ synced: boolean; action?: "pulled" | "pushed" | "idle" }> {
  try {
    const status = await getGoogleDriveStatus();
    if (!status.isConnected || !status.autoSyncEnabled) {
      return { synced: false, action: "idle" };
    }

    const token = await repo.getSetting(SETTING_TOKEN);
    if (!token) return { synced: false, action: "idle" };

    // 1. Check if cloud file exists and its timestamp
    const query = encodeURIComponent(`name = '${BACKUP_FILENAME}' and trashed = false`);
    const listUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`;
    const listRes = await fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } });
    if (!listRes.ok) return { synced: false, action: "idle" };

    const listData = await listRes.json();
    const cloudFile = listData.files?.[0];

    const localLastBackup = status.lastBackupTime;

    if (cloudFile && cloudFile.modifiedTime) {
      const cloudDate = new Date(cloudFile.modifiedTime).getTime();
      const localDate = localLastBackup ? new Date(localLastBackup).getTime() : 0;

      // Cloud has newer data -> silently pull and restore
      if (cloudDate > localDate + 1000) {
        const { backupData } = await downloadBackupFromGoogleDrive();
        const analysis = await analyzeBackup(backupData);

        await executeImport(backupData, {
          vehicles_to_add: analysis.new_vehicles.map((v) => v.id_in_backup),
          conflict_resolutions: analysis.conflicting_vehicles.map((c) => ({
            vin: c.vin,
            action: "replace",
          })),
        });

        await repo.setSetting(SETTING_LAST_BACKUP, cloudFile.modifiedTime);
        if (onDataUpdated) onDataUpdated();
        return { synced: true, action: "pulled" };
      }
    }

    // Local is newer or cloud file doesn't exist -> silently push
    const localBackup = await exportBackupData({ include_maintenance_logs: true });
    if (localBackup.vehicles.length > 0 || localBackup.service_types.length > 0) {
      await uploadBackupToGoogleDrive(localBackup);
      return { synced: true, action: "pushed" };
    }

    return { synced: true, action: "idle" };
  } catch {
    // Fail silently in background
    return { synced: false, action: "idle" };
  }
}

let _pushTimeout: any = null;

/**
 * Triggers a debounced background sync upload whenever local data changes.
 */
export function triggerBackgroundCloudPush(): void {
  if (_pushTimeout) clearTimeout(_pushTimeout);
  _pushTimeout = setTimeout(async () => {
    try {
      const status = await getGoogleDriveStatus();
      if (!status.isConnected || !status.autoSyncEnabled) return;
      const backup = await exportBackupData({ include_maintenance_logs: true });
      await uploadBackupToGoogleDrive(backup);
    } catch {
      // Fail silently in background
    }
  }, 2500);
}

async function findBackupFileId(token: string): Promise<string | null> {
  try {
    const query = encodeURIComponent(`name = '${BACKUP_FILENAME}' and trashed = false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&pageSize=1`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.files?.[0]?.id ?? null;
  } catch {
    return null;
  }
}
