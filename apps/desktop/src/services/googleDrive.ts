// Google account connection for sync, plus the visible `carbaddie_backup.json` file in Drive
// (the format older app versions and the mobile app exchange).
//
// Sign-in: OAuth authorization code flow with PKCE and `state`, redirected to a loopback port
// the Rust shell listens on. The refresh token lives in the OS keychain (src-tauri/src/secrets.rs);
// the access token only in memory. Non-secret details (email, client id, auto sync) stay in
// localStorage.
import { invoke } from "@tauri-apps/api/core";
import { DRIVE_APPDATA_SCOPE, parseBackup } from "@carbaddie/core";
import { FullBackupData } from "../types";

export interface GoogleDriveStatus {
  isConnected: boolean;
  email?: string;
  lastBackupTime?: string;
  autoSyncEnabled: boolean;
}

const STORAGE_EMAIL = "carbaddie_gdrive_email";
const STORAGE_LAST_BACKUP = "carbaddie_gdrive_last_backup";
const STORAGE_AUTO_SYNC = "carbaddie_gdrive_auto_sync";
const STORAGE_CLIENT_ID = "carbaddie_gdrive_client_id";
/** Tokens older versions kept in localStorage; removed, they lacked the sync scope anyway. */
const LEGACY_STORAGE_KEYS = ["carbaddie_gdrive_token", "carbaddie_gdrive_refresh_token", "carbaddie_gdrive_file_id"];
const SECRET_REFRESH_TOKEN = "google_refresh_token";
const BACKUP_FILENAME = "carbaddie_backup.json";

const DEFAULT_GOOGLE_CLIENT_ID = "58648902421-3ksgpe4l3jetkbvi5rusivmp02glltuq.apps.googleusercontent.com";
/**
 * Google's "Desktop app" OAuth clients also want their client secret on token requests (it is
 * not confidential for installed apps). Set VITE_GOOGLE_CLIENT_SECRET if yours does.
 */
const CLIENT_SECRET: string | undefined = import.meta.env.VITE_GOOGLE_CLIENT_SECRET || undefined;

const SCOPES = [
  DRIVE_APPDATA_SCOPE, // sync files, hidden in the app's own Drive folder
  "https://www.googleapis.com/auth/drive.file", // the visible backup file
  "https://www.googleapis.com/auth/userinfo.email",
];

/** Thrown when Drive has no CarBaddie backup file yet (as opposed to a network/auth failure). */
export class BackupNotFoundError extends Error {
  constructor(message = `No '${BACKUP_FILENAME}' found in your Google Drive.`) {
    super(message);
    this.name = "BackupNotFoundError";
  }
}

/** Thrown when there is no usable Google sign-in. */
export class NotConnectedError extends Error {
  constructor(message = "Google Drive is not connected. Sign in with Google first.") {
    super(message);
    this.name = "NotConnectedError";
  }
}

for (const key of LEGACY_STORAGE_KEYS) localStorage.removeItem(key);

let accessToken: { value: string; expiresAt: number } | null = null;

const clientId = () => localStorage.getItem(STORAGE_CLIENT_ID) || DEFAULT_GOOGLE_CLIENT_ID;

function randomUrlSafe(bytes: number): string {
  return base64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

function base64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function codeChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return base64Url(new Uint8Array(digest));
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function tokenRequest(params: Record<string, string>): Promise<TokenResponse> {
  const body = new URLSearchParams({ client_id: clientId(), ...params });
  if (CLIENT_SECRET) body.set("client_secret", CLIENT_SECRET);
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json()) as TokenResponse;
  if (!res.ok || !data.access_token) {
    const missingSecret = !CLIENT_SECRET && /client_secret is missing/i.test(data.error_description ?? "");
    const message = missingSecret
      ? "This Google OAuth client needs its client secret: set VITE_GOOGLE_CLIENT_SECRET in apps/desktop/.env.local and restart the app."
      : data.error_description || data.error || `Token request failed (${res.status})`;
    throw Object.assign(new Error(message), {
      code: data.error,
    });
  }
  return data;
}

function remember(data: TokenResponse) {
  accessToken = { value: data.access_token!, expiresAt: Date.now() + ((data.expires_in ?? 3600) - 60) * 1000 };
}

/**
 * A valid access token, refreshed with the stored refresh token when needed. Throws
 * NotConnectedError if there is no sign-in or Google revoked it.
 */
export async function getAccessToken(forceRefresh = false): Promise<string> {
  if (accessToken && !forceRefresh && Date.now() < accessToken.expiresAt) return accessToken.value;
  const refreshToken = await invoke<string | null>("secret_get", { name: SECRET_REFRESH_TOKEN });
  if (!refreshToken) throw new NotConnectedError();
  try {
    remember(await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken }));
  } catch (e) {
    if ((e as { code?: string }).code === "invalid_grant") {
      await disconnectGoogleDrive();
      throw new NotConnectedError("Google sign-in expired or was revoked. Sign in with Google again.");
    }
    throw e;
  }
  return accessToken!.value;
}

export async function getGoogleDriveStatus(): Promise<GoogleDriveStatus> {
  let isConnected = false;
  try {
    isConnected = !!(await invoke<string | null>("secret_get", { name: SECRET_REFRESH_TOKEN }));
  } catch (e) {
    console.warn("Could not read the keychain:", e);
  }
  return {
    isConnected,
    email: localStorage.getItem(STORAGE_EMAIL) || undefined,
    lastBackupTime: localStorage.getItem(STORAGE_LAST_BACKUP) || undefined,
    autoSyncEnabled: localStorage.getItem(STORAGE_AUTO_SYNC) !== "false",
  };
}

export function setAutoSyncEnabled(enabled: boolean): void {
  localStorage.setItem(STORAGE_AUTO_SYNC, enabled ? "true" : "false");
}

export async function disconnectGoogleDrive(): Promise<void> {
  accessToken = null;
  await invoke("secret_delete", { name: SECRET_REFRESH_TOKEN });
  localStorage.removeItem(STORAGE_EMAIL);
  localStorage.removeItem(STORAGE_LAST_BACKUP);
}

/**
 * Signs in through the system browser: the Rust shell listens on a random loopback port and
 * hands back the redirect's query string.
 */
export async function signInWithGoogle(customClientId?: string): Promise<{ success: boolean; email?: string; error?: string }> {
  if (customClientId?.trim()) localStorage.setItem(STORAGE_CLIENT_ID, customClientId.trim());
  try {
    const { open } = await import("@tauri-apps/plugin-shell");
    const verifier = randomUrlSafe(32);
    const state = randomUrlSafe(16);
    const port = await invoke<number>("start_oauth_listener");
    const redirectUri = `http://127.0.0.1:${port}`;

    const authUrl =
      "https://accounts.google.com/o/oauth2/v2/auth?" +
      new URLSearchParams({
        client_id: clientId(),
        redirect_uri: redirectUri,
        response_type: "code",
        scope: SCOPES.join(" "),
        code_challenge: await codeChallenge(verifier),
        code_challenge_method: "S256",
        state,
        access_type: "offline",
        // consent: always return a refresh token, even for an account that signed in before.
        prompt: "consent select_account",
      });
    await open(authUrl);

    const params = new URLSearchParams(await invoke<string>("wait_oauth_token"));
    if (params.get("state") !== state) {
      return { success: false, error: "Sign-in response didn't match this request. Please try again." };
    }
    const code = params.get("code");
    if (!code) {
      const err = params.get("error");
      return { success: false, error: err ? `Google authorization denied: ${err}` : "No authorization code received." };
    }

    const tokens = await tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri });
    if (!tokens.scope?.split(" ").includes(DRIVE_APPDATA_SCOPE)) {
      return { success: false, error: "Sync needs permission to store CarBaddie's data in your Google Drive. Please allow it." };
    }
    if (!tokens.refresh_token) {
      return { success: false, error: "Google didn't return a refresh token. Please try signing in again." };
    }
    await invoke("secret_set", { name: SECRET_REFRESH_TOKEN, value: tokens.refresh_token });
    remember(tokens);

    let email: string | undefined;
    try {
      const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      });
      if (res.ok) email = ((await res.json()) as { email?: string }).email;
    } catch {
      // The email is only shown in settings.
    }
    if (email) localStorage.setItem(STORAGE_EMAIL, email);
    return { success: true, email };
  } catch (e) {
    return { success: false, error: (e as Error).message || "Sign-in failed." };
  }
}

// ------------------------------------------------------------------
// The visible backup file
// ------------------------------------------------------------------

async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const send = async (token: string) =>
    fetch(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } });
  const res = await send(await getAccessToken());
  return res.status === 401 ? send(await getAccessToken(true)) : res;
}

async function findBackupFile(): Promise<{ id: string; modifiedTime: string } | null> {
  const query = encodeURIComponent(`name = '${BACKUP_FILENAME}' and trashed = false`);
  const res = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,modifiedTime)&orderBy=modifiedTime desc&pageSize=1`,
  );
  if (!res.ok) throw new Error(`Failed to search Google Drive for the backup file (${res.status}).`);
  return ((await res.json()) as { files?: { id: string; modifiedTime: string }[] }).files?.[0] ?? null;
}

/** Writes `carbaddie_backup.json`, replacing the existing one. */
export async function uploadBackupToGoogleDrive(backupData: FullBackupData): Promise<{ modifiedTime: string }> {
  const existing = await findBackupFile();
  const boundary = `CarBaddieBoundary${Date.now()}`;
  const metadata = existing
    ? { description: "CarBaddie backup" }
    : { name: BACKUP_FILENAME, mimeType: "application/json", description: "CarBaddie backup" };
  const body =
    `\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}` +
    `\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(backupData, null, 2)}\r\n--${boundary}--`;
  const url = existing
    ? `https://www.googleapis.com/upload/drive/v3/files/${existing.id}?uploadType=multipart`
    : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
  const res = await driveFetch(url, {
    method: existing ? "PATCH" : "POST",
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    body,
  });
  if (!res.ok) throw new Error(`Google Drive upload failed (${res.status}): ${await res.text()}`);
  const modifiedTime = new Date().toISOString();
  localStorage.setItem(STORAGE_LAST_BACKUP, modifiedTime);
  return { modifiedTime };
}

/** Reads `carbaddie_backup.json`. Throws BackupNotFoundError if there is none. */
export async function downloadBackupFromGoogleDrive(): Promise<{ backupData: FullBackupData; modifiedTime: string }> {
  const file = await findBackupFile();
  if (!file) throw new BackupNotFoundError();
  const res = await driveFetch(`https://www.googleapis.com/drive/v3/files/${file.id}?alt=media`);
  if (!res.ok) throw new Error(`Failed to download the backup from Google Drive (${res.status}).`);
  try {
    return { backupData: parseBackup(JSON.parse(await res.text())), modifiedTime: file.modifiedTime };
  } catch (e) {
    throw new Error(`The backup file in Google Drive is invalid or corrupted. ${e instanceof Error ? e.message : ""}`.trim());
  }
}
