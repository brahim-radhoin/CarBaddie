// Sync transport over Google Drive's appDataFolder: a hidden per-app space in the user's
// Drive, reachable only with the `drive.appdata` scope. Plain fetch, so it runs on desktop
// (webview) and mobile (React Native) alike.

import type { RemoteFile, SyncTransport } from "./transport";

export const DRIVE_APPDATA_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

const API = "https://www.googleapis.com/drive/v3/files";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";

export class DriveError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "DriveError";
    this.status = status;
  }
}

export interface DriveTransportOptions {
  /** A valid access token; with `forceRefresh`, a new one (called once after a 401). */
  getAccessToken(forceRefresh?: boolean): Promise<string>;
  fetch?: typeof fetch;
}

export function createDriveTransport({ getAccessToken, fetch: fetchImpl = fetch }: DriveTransportOptions): SyncTransport {
  async function request(url: string, init: RequestInit = {}): Promise<Response> {
    const send = async (token: string) =>
      fetchImpl(url, { ...init, headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` } });
    let res = await send(await getAccessToken());
    if (res.status === 401) res = await send(await getAccessToken(true));
    return res;
  }

  async function expectOk(res: Response, what: string): Promise<Response> {
    if (res.ok) return res;
    let detail = "";
    try {
      detail = ((await res.json()) as { error?: { message?: string } }).error?.message ?? "";
    } catch {
      // not JSON
    }
    throw new DriveError(res.status, `Google Drive ${what} failed (${res.status})${detail ? `: ${detail}` : ""}`);
  }

  return {
    async list() {
      const files: RemoteFile[] = [];
      let pageToken: string | undefined;
      do {
        const params = new URLSearchParams({
          spaces: "appDataFolder",
          fields: "nextPageToken,files(id,name)",
          pageSize: "1000",
          q: "name contains 'carbaddie-' and trashed = false",
        });
        if (pageToken) params.set("pageToken", pageToken);
        const res = await expectOk(await request(`${API}?${params}`), "listing");
        const body = (await res.json()) as { nextPageToken?: string; files?: RemoteFile[] };
        files.push(...(body.files ?? []).map((f) => ({ id: f.id, name: f.name })));
        pageToken = body.nextPageToken;
      } while (pageToken);
      return files;
    },

    async read(file) {
      const res = await expectOk(await request(`${API}/${encodeURIComponent(file.id)}?alt=media`), `download of ${file.name}`);
      return res.json();
    },

    async create(name, content) {
      const boundary = `carbaddie-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
      const metadata = { name, parents: ["appDataFolder"], mimeType: "application/json" };
      const body =
        `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
        `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(content)}\r\n--${boundary}--`;
      await expectOk(
        await request(`${UPLOAD}?uploadType=multipart&fields=id`, {
          method: "POST",
          headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
          body,
        }),
        `upload of ${name}`,
      );
    },

    async remove(file) {
      const res = await request(`${API}/${encodeURIComponent(file.id)}`, { method: "DELETE" });
      if (res.status !== 404) await expectOk(res, `delete of ${file.name}`);
    },
  };
}
