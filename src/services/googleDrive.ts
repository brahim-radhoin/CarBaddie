import { FullBackupData } from "../types";

export interface GoogleDriveStatus {
  isConnected: boolean;
  email?: string;
  lastBackupTime?: string;
  fileId?: string;
  autoSyncEnabled: boolean;
}

const STORAGE_TOKEN = "carbaddie_gdrive_token";
const STORAGE_REFRESH_TOKEN = "carbaddie_gdrive_refresh_token";
const STORAGE_EMAIL = "carbaddie_gdrive_email";
const STORAGE_LAST_BACKUP = "carbaddie_gdrive_last_backup";
const STORAGE_FILE_ID = "carbaddie_gdrive_file_id";
const STORAGE_AUTO_SYNC = "carbaddie_gdrive_auto_sync";
const STORAGE_CLIENT_ID = "carbaddie_gdrive_client_id";
const BACKUP_FILENAME = "carbaddie_backup.json";

/** Thrown when Drive has no CarBaddie backup file yet (as opposed to a network/auth failure). */
export class BackupNotFoundError extends Error {
  constructor(message = "No 'carbaddie_backup.json' found in your Google Drive.") {
    super(message);
    this.name = "BackupNotFoundError";
  }
}

const DEFAULT_GOOGLE_CLIENT_ID = "58648902421-3ksgpe4l3jetkbvi5rusivmp02glltuq.apps.googleusercontent.com";

function generateCodeVerifier(): string {
  const array = new Uint8Array(32);
  window.crypto.getRandomValues(array);
  return Array.from(array, (dec) => ("0" + dec.toString(16)).slice(-2)).join("");
}

async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await window.crypto.subtle.digest("SHA-256", data);
  const bytes = new Uint8Array(digest);
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function refreshAccessToken(): Promise<string | null> {
  const refreshToken = localStorage.getItem(STORAGE_REFRESH_TOKEN);
  const clientId = localStorage.getItem(STORAGE_CLIENT_ID) || DEFAULT_GOOGLE_CLIENT_ID;
  if (!refreshToken) return null;

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });
    const data = await res.json();
    if (data.access_token) {
      localStorage.setItem(STORAGE_TOKEN, data.access_token);
      return data.access_token;
    }
  } catch {
    // Ignore
  }
  return null;
}

export function getGoogleDriveStatus(): GoogleDriveStatus {
  const token = localStorage.getItem(STORAGE_TOKEN);
  const email = localStorage.getItem(STORAGE_EMAIL);
  const lastBackupTime = localStorage.getItem(STORAGE_LAST_BACKUP);
  const fileId = localStorage.getItem(STORAGE_FILE_ID);
  const autoSync = localStorage.getItem(STORAGE_AUTO_SYNC);

  return {
    isConnected: !!token,
    email: email || undefined,
    lastBackupTime: lastBackupTime || undefined,
    fileId: fileId || undefined,
    autoSyncEnabled: autoSync !== "false",
  };
}

export async function setGoogleDriveToken(token: string, email?: string): Promise<void> {
  localStorage.setItem(STORAGE_TOKEN, token.trim());
  if (email) {
    localStorage.setItem(STORAGE_EMAIL, email.trim());
  } else {
    try {
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${token.trim()}` },
      });
      if (res.ok) {
        const info = await res.json();
        if (info.email) {
          localStorage.setItem(STORAGE_EMAIL, info.email);
        }
      }
    } catch {
      // Ignore
    }
  }
}

export function setAutoSyncEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_AUTO_SYNC, enabled ? "true" : "false");
}

export function disconnectGoogleDrive(): void {
  localStorage.removeItem(STORAGE_TOKEN);
  localStorage.removeItem(STORAGE_REFRESH_TOKEN);
  localStorage.removeItem(STORAGE_EMAIL);
  localStorage.removeItem(STORAGE_FILE_ID);
}

/**
 * Launches Google OAuth in the system browser via a local redirect server.
 * Uses RFC 7636 PKCE Authorization Code flow supported by Google Desktop clients.
 */
export async function signInWithGoogle(customClientId?: string): Promise<{
  success: boolean;
  email?: string;
  error?: string;
}> {
  const clientId =
    customClientId ||
    localStorage.getItem(STORAGE_CLIENT_ID) ||
    DEFAULT_GOOGLE_CLIENT_ID;

  if (customClientId) {
    localStorage.setItem(STORAGE_CLIENT_ID, customClientId.trim());
  }

  const scopes = [
    "https://www.googleapis.com/auth/drive.file",
    "https://www.googleapis.com/auth/userinfo.email",
  ].join(" ");

  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  if (isTauri) {
    // ── Tauri path: dynamic local loopback server + PKCE authorization code flow ──
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const { open } = await import("@tauri-apps/plugin-shell");

      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);

      // Step 1: Start local listener on an OS-assigned ephemeral port
      const port = await invoke<number>("start_oauth_listener");
      const redirectUri = `http://127.0.0.1:${port}`;

      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(clientId)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=code&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `code_challenge=${encodeURIComponent(codeChallenge)}&` +
        `code_challenge_method=S256&` +
        `prompt=select_account`;

      // Step 2: Open user's default system browser (Chrome/Edge/Firefox)
      await open(authUrl);

      // Step 3: Wait for browser to redirect back to local loopback server
      const query = await invoke<string>("wait_oauth_token");
      const params = new URLSearchParams(query);
      const code = params.get("code");
      const err = params.get("error");

      if (!code) {
        return {
          success: false,
          error: err ? `Google authorization denied: ${err}` : "No authorization code received.",
        };
      }

      // Step 4: Exchange authorization code + code_verifier for tokens
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          code: code,
          code_verifier: codeVerifier,
          grant_type: "authorization_code",
          redirect_uri: redirectUri,
        }),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.access_token) {
        return {
          success: false,
          error: tokenData.error_description || tokenData.error || "Failed to exchange authorization code.",
        };
      }

      if (tokenData.refresh_token) {
        localStorage.setItem(STORAGE_REFRESH_TOKEN, tokenData.refresh_token);
      }

      await setGoogleDriveToken(tokenData.access_token);
      const status = getGoogleDriveStatus();
      return { success: true, email: status.email };
    } catch (e: any) {
      return { success: false, error: e.message || "Sign-in failed." };
    }
  }

  // ── Web browser fallback: window.open popup ──────────────────────────────
  return new Promise((resolve) => {
    try {
      const redirectUri = window.location.origin;
      const authUrl =
        `https://accounts.google.com/o/oauth2/v2/auth?` +
        `client_id=${encodeURIComponent(clientId)}&` +
        `redirect_uri=${encodeURIComponent(redirectUri)}&` +
        `response_type=token&` +
        `scope=${encodeURIComponent(scopes)}&` +
        `prompt=select_account`;

      const width = 500;
      const height = 600;
      const left = window.screenX + (window.outerWidth - width) / 2;
      const top = window.screenY + (window.outerHeight - height) / 2;

      const popup = window.open(
        authUrl,
        "GoogleSignIn",
        `width=${width},height=${height},left=${left},top=${top}`
      );

      if (!popup) {
        resolve({
          success: false,
          error: "Popup blocked. Please allow popups for this app.",
        });
        return;
      }

      const checkTimer = setInterval(async () => {
        try {
          if (!popup || popup.closed) {
            clearInterval(checkTimer);
            resolve({ success: false, error: "Sign-in was closed." });
            return;
          }
          if (popup.location?.href.includes(redirectUri)) {
            const hash = popup.location.hash;
            if (hash?.includes("access_token=")) {
              clearInterval(checkTimer);
              const params = new URLSearchParams(hash.replace("#", ""));
              const token = params.get("access_token");
              popup.close();
              if (token) {
                await setGoogleDriveToken(token);
                const status = getGoogleDriveStatus();
                resolve({ success: true, email: status.email });
              } else {
                resolve({ success: false, error: "No access token found." });
              }
            }
          }
        } catch {
          // Cross-origin throws while on google.com domain — expected
        }
      }, 500);
    } catch (e: any) {
      resolve({ success: false, error: e.message || "Failed to start sign-in." });
    }
  });
}

export async function uploadBackupToGoogleDrive(
  backupData: FullBackupData
): Promise<{ fileId: string; modifiedTime: string }> {
  const token = localStorage.getItem(STORAGE_TOKEN);
  if (!token) {
    throw new Error("Google Drive is not connected. Please connect your Google account first.");
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
      const freshToken = await refreshAccessToken();
      if (freshToken) {
        return uploadBackupToGoogleDrive(backupData);
      }
      disconnectGoogleDrive();
      throw new Error("Google Drive access token expired. Please reconnect your account.");
    }
    const errText = await res.text();
    throw new Error(`Google Drive upload failed (${res.status}): ${errText}`);
  }

  const result = await res.json();
  const fileId = result.id || existingFileId;
  const nowIso = new Date().toISOString();

  localStorage.setItem(STORAGE_FILE_ID, fileId);
  localStorage.setItem(STORAGE_LAST_BACKUP, nowIso);

  return { fileId, modifiedTime: nowIso };
}

export async function downloadBackupFromGoogleDrive(): Promise<{
  backupData: FullBackupData;
  modifiedTime: string;
  fileId: string;
}> {
  const token = localStorage.getItem(STORAGE_TOKEN);
  if (!token) {
    throw new Error("Google Drive is not connected. Please connect your Google account first.");
  }

  const query = encodeURIComponent(`name = '${BACKUP_FILENAME}' and trashed = false`);
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,size)&orderBy=modifiedTime desc`;

  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!listRes.ok) {
    if (listRes.status === 401) {
      const freshToken = await refreshAccessToken();
      if (freshToken) {
        return downloadBackupFromGoogleDrive();
      }
      disconnectGoogleDrive();
      throw new Error("Google Drive access token expired. Please reconnect your account.");
    }
    throw new Error("Failed to search Google Drive for backup files.");
  }

  const listData = await listRes.json();
  const file = listData.files?.[0];

  if (!file) {
    throw new BackupNotFoundError();
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

async function findBackupFileId(token: string): Promise<string | null> {
  try {
    const query = encodeURIComponent(`name = '${BACKUP_FILENAME}' and trashed = false`);
    const url = `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id)&pageSize=1`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) return null;
    const data = await res.json();
    return data.files?.[0]?.id || null;
  } catch {
    return null;
  }
}
