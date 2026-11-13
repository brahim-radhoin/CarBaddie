// Where sync files live. The apps use the Google Drive transport (sync/drive.ts); tests use
// an in-memory one.

export interface RemoteFile {
  /** Transport-specific handle (a Drive file id). */
  id: string;
  name: string;
}

export interface SyncTransport {
  /** Every file in the sync space. */
  list(): Promise<RemoteFile[]>;
  /** The parsed JSON content of a file. */
  read(file: RemoteFile): Promise<unknown>;
  /** Creates a new file. Names are unique per device, so this never replaces another device's file. */
  create(name: string, content: unknown): Promise<void>;
  /** Deletes a file; deleting one that's already gone is not an error. */
  remove(file: RemoteFile): Promise<void>;
}
