// The files devices exchange through the sync transport (Google Drive's appDataFolder).
//
// Every device only ever writes its own files:
// - carbaddie-chg-<device>-<seq>.json   rows it changed since its previous change file
// - carbaddie-snap-<device>-<seq>.json  every row it had after writing change file <seq>
//   (compaction: its change files up to <seq> are deleted once the snapshot exists)
//
// Rows are full copies with their sync columns; the receiver keeps whichever copy has the
// newer `updated_at` (last writer wins), so applying a file twice changes nothing.

import { z } from "zod";

export const SYNC_FILE_FORMAT = "carbaddie-sync";
export const SYNC_FILE_VERSION = 1;

const HLC_PATTERN = /^\d{15}-\d{6}-.+$/;

const rowSchema = z
  .record(z.string(), z.union([z.string(), z.number(), z.null()]))
  .refine((row) => typeof row.updated_at === "string" && HLC_PATTERN.test(row.updated_at), {
    message: "Row has no valid updated_at",
  })
  .refine((row) => typeof row.device_id === "string", { message: "Row has no device_id" });

export type SyncRow = Record<string, string | number | null>;

export const syncFileSchema = z.object({
  format: z.literal(SYNC_FILE_FORMAT),
  version: z.literal(SYNC_FILE_VERSION),
  kind: z.enum(["changes", "snapshot"]),
  device_id: z.string().min(1),
  seq: z.number().int().positive(),
  /** Schema version of the writer. What shape the rows have (sync/upgrade.ts reads it). */
  schema_version: z.number().int().nonnegative(),
  /**
   * The oldest app schema that can read this file safely (the writer's newest "breaking"
   * migration, db/migrations.ts). Absent in files from before the rule: they need schema_version.
   */
  min_reader: z.number().int().nonnegative().optional(),
  created_at: z.string(),
  /** Table name → rows. Tables this device doesn't know are ignored. */
  tables: z.record(z.string(), z.array(rowSchema)),
});

export type SyncFile = z.output<typeof syncFileSchema>;

/**
 * Whether this app can read a file, decided from the envelope alone: the strict parse below
 * would call a file from a newer app "invalid" and hide the real reason. A file this app
 * cannot read is skipped (and reported), never half-applied.
 */
export function checkSyncFile(json: unknown, readerVersion: number): { readable: true } | { readable: false; needs: number } {
  const o = json && typeof json === "object" ? (json as Record<string, unknown>) : null;
  if (!o || o.format !== SYNC_FILE_FORMAT) throw new Error("Invalid sync file: not a CarBaddie sync file");
  if (typeof o.version === "number" && o.version > SYNC_FILE_VERSION) return { readable: false, needs: Number.MAX_SAFE_INTEGER };
  const needs = typeof o.min_reader === "number" ? o.min_reader : typeof o.schema_version === "number" ? o.schema_version : 0;
  return needs > readerVersion ? { readable: false, needs } : { readable: true };
}

export function parseSyncFile(json: unknown): SyncFile {
  const result = syncFileSchema.safeParse(json);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.length ? ` at ${first.path.join(".")}` : "";
    throw new Error(`Invalid sync file${where}: ${first?.message ?? "unknown error"}`);
  }
  return result.data as SyncFile;
}

export interface SyncFileName {
  kind: SyncFile["kind"];
  deviceId: string;
  seq: number;
}

const NAME_PATTERN = /^carbaddie-(chg|snap)-(.+)-(\d{10})\.json$/;

export function syncFileName({ kind, deviceId, seq }: SyncFileName): string {
  return `carbaddie-${kind === "changes" ? "chg" : "snap"}-${deviceId}-${String(seq).padStart(10, "0")}.json`;
}

/** Null for files that aren't sync files. */
export function parseSyncFileName(name: string): SyncFileName | null {
  const m = NAME_PATTERN.exec(name);
  if (!m) return null;
  return { kind: m[1] === "chg" ? "changes" : "snapshot", deviceId: m[2], seq: Number(m[3]) };
}
