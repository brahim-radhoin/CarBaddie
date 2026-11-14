// The sync engine: pull other devices' files, merge them row by row (last writer wins on the
// HLC `updated_at`), push this device's own changes, and compact its files into a snapshot.
//
// Rules that keep every device converging on the same data:
// - a row is replaced only by a copy with a newer `updated_at`
// - two live vehicles with the same VIN are merged: the one with the smaller id stays, the
//   other is tombstoned with `merged_into`, and its logs, odometer readings and overrides
//   move to the survivor
// - two live service types (or two active fields of one service type) with the same name:
//   the one with the larger id is renamed "Name (2)"
// - after merging, children of tombstoned parents are tombstoned too (a delete on one device
//   racing an edit on another)
// Every fix-up is an ordinary local write, so it syncs like any other change.
//
// Local state (app_settings, never synced): `sync.seq` (last change file written),
// `sync.cursor` (newest own `updated_at` pushed), `sync.seen` (JSON: device → last applied seq).

import { LATEST_SCHEMA_VERSION } from "../db/migrations.ts";
import { transaction } from "../db/transaction.ts";
import { intervalOverrideId } from "../ids/uuid.ts";
import { parseSyncFile, parseSyncFileName, syncFileName, SYNC_FILE_FORMAT, SYNC_FILE_VERSION } from "./files.ts";
import { SYNCED_TABLE_INFO } from "./tables.ts";
import { upgradeRow } from "./upgrade.ts";
import type { SqlDriver, SqlValue, WriteContext } from "../db/driver";
import type { SyncFile, SyncRow } from "./files";
import type { SyncedTable } from "./tables";
import type { RemoteFile, SyncTransport } from "./transport";

export interface SyncOptions {
  /** Write a snapshot once this device has more change files than this. Default 50. */
  compactAfter?: number;
  now?: () => Date;
}

export interface SyncResult {
  /** Files downloaded from other devices. */
  downloaded: number;
  /** Rows changed locally by the merge (including fix-ups). */
  applied: number;
  /** Rows uploaded in this device's new change file. */
  uploaded: number;
  compacted: boolean;
}

export const SYNC_SETTING_KEYS = {
  seq: "sync.seq",
  cursor: "sync.cursor",
  seen: "sync.seen",
  lastSuccess: "sync.last_success",
} as const;

const running = new WeakMap<SqlDriver, Promise<SyncResult>>();

/** Runs one sync. A call while another sync of the same database runs joins that one. */
export function runSync(db: SqlDriver, w: WriteContext, transport: SyncTransport, options: SyncOptions = {}): Promise<SyncResult> {
  const current = running.get(db);
  if (current) return current;
  const run = syncOnce(db, w, transport, options).finally(() => running.delete(db));
  running.set(db, run);
  return run;
}

/**
 * Forgets what was pushed and pulled, so the next sync uploads every local row and reads
 * every remote file again. Use it when the user connects a (possibly different) account.
 */
export async function resetSyncState(db: SqlDriver): Promise<void> {
  const keys = Object.values(SYNC_SETTING_KEYS);
  await db.run(`DELETE FROM app_settings WHERE key IN (${keys.map(() => "?").join(", ")})`, keys);
}

// ------------------------------------------------------------------

interface DeviceFiles {
  changes: Map<number, RemoteFile>;
  snapshot: { seq: number; file: RemoteFile } | null;
  snapshots: RemoteFile[];
}

async function getSetting(db: SqlDriver, key: string): Promise<string | null> {
  const [row] = await db.all<{ value: string }>("SELECT value FROM app_settings WHERE key = ?", [key]);
  return row?.value ?? null;
}

async function setSetting(db: SqlDriver, key: string, value: string): Promise<void> {
  await db.run("INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)", [key, value]);
}

function groupByDevice(files: RemoteFile[]): Map<string, DeviceFiles> {
  const devices = new Map<string, DeviceFiles>();
  for (const file of files) {
    const name = parseSyncFileName(file.name);
    if (!name) continue;
    let d = devices.get(name.deviceId);
    if (!d) devices.set(name.deviceId, (d = { changes: new Map(), snapshot: null, snapshots: [] }));
    if (name.kind === "changes") {
      d.changes.set(name.seq, file);
    } else {
      d.snapshots.push(file);
      if (!d.snapshot || name.seq > d.snapshot.seq) d.snapshot = { seq: name.seq, file };
    }
  }
  return devices;
}

async function syncOnce(db: SqlDriver, w: WriteContext, transport: SyncTransport, options: SyncOptions): Promise<SyncResult> {
  const now = options.now ?? (() => new Date());
  const listing = await transport.list();
  const devices = groupByDevice(listing);

  // ---- Pull: per device, its snapshot if we're missing files it compacted, then its
  // change files in order, stopping at the first gap.
  const seen: Record<string, number> = JSON.parse((await getSetting(db, SYNC_SETTING_KEYS.seen)) ?? "{}");
  const toDownload: RemoteFile[] = [];
  const newSeen = { ...seen };
  for (const [deviceId, files] of devices) {
    if (deviceId === w.deviceId) continue;
    let at = seen[deviceId] ?? 0;
    if (files.snapshot && files.snapshot.seq > at && !files.changes.has(at + 1)) {
      toDownload.push(files.snapshot.file);
      at = files.snapshot.seq;
    }
    while (files.changes.has(at + 1)) toDownload.push(files.changes.get(++at)!);
    newSeen[deviceId] = at;
  }

  const downloaded: SyncFile[] = [];
  for (const file of toDownload) {
    const parsed = parseSyncFile(await transport.read(file));
    const name = parseSyncFileName(file.name)!;
    if (parsed.device_id !== name.deviceId || parsed.seq !== name.seq) {
      throw new Error(`Sync file ${file.name} doesn't match its name`);
    }
    if (parsed.schema_version > LATEST_SCHEMA_VERSION) {
      throw new Error("Another device syncs with a newer version of CarBaddie. Update this app to keep syncing.");
    }
    downloaded.push(parsed);
  }

  const applied = await transaction(db, async () => {
    const count = downloaded.length ? await mergeFiles(db, w, downloaded) : 0;
    await setSetting(db, SYNC_SETTING_KEYS.seen, JSON.stringify(newSeen));
    return count;
  });

  // ---- Push: every row this device wrote since the last push.
  const own = devices.get(w.deviceId);
  const ownSeqs = [...(own?.changes.keys() ?? []), ...(own?.snapshot ? [own.snapshot.seq] : [])];
  let seq = Math.max(Number((await getSetting(db, SYNC_SETTING_KEYS.seq)) ?? 0), ...ownSeqs, 0);
  const cursor = (await getSetting(db, SYNC_SETTING_KEYS.cursor)) ?? "";
  const changes = await transaction(db, () => readRows(db, "device_id = ? AND updated_at > ?", [w.deviceId, cursor]));

  let ownChangeFiles = own?.changes.size ?? 0;
  if (changes.count > 0) {
    seq += 1;
    await transport.create(syncFileName({ kind: "changes", deviceId: w.deviceId, seq }), syncFile(w, "changes", seq, changes.tables, now()));
    await setSetting(db, SYNC_SETTING_KEYS.seq, String(seq));
    await setSetting(db, SYNC_SETTING_KEYS.cursor, changes.maxUpdatedAt);
    ownChangeFiles += 1;
  }

  // ---- Compact: a snapshot of everything, then drop the change files it covers.
  let compacted = false;
  if (seq > 0 && ownChangeFiles > (options.compactAfter ?? 50)) {
    const everything = await transaction(db, () => readRows(db, "1 = 1", []));
    await transport.create(syncFileName({ kind: "snapshot", deviceId: w.deviceId, seq }), syncFile(w, "snapshot", seq, everything.tables, now()));
    for (const [n, file] of own?.changes ?? []) if (n <= seq) await transport.remove(file);
    for (const file of own?.snapshots ?? []) await transport.remove(file);
    compacted = true;
  }

  await setSetting(db, SYNC_SETTING_KEYS.lastSuccess, now().toISOString());
  return { downloaded: downloaded.length, applied, uploaded: changes.count, compacted };
}

function syncFile(w: WriteContext, kind: SyncFile["kind"], seq: number, tables: Record<string, SyncRow[]>, at: Date): SyncFile {
  return {
    format: SYNC_FILE_FORMAT,
    version: SYNC_FILE_VERSION,
    kind,
    device_id: w.deviceId,
    seq,
    schema_version: LATEST_SCHEMA_VERSION,
    created_at: at.toISOString(),
    tables,
  };
}

async function readRows(db: SqlDriver, where: string, params: SqlValue[]) {
  const tables: Record<string, SyncRow[]> = {};
  let count = 0;
  let maxUpdatedAt = "";
  for (const { name } of SYNCED_TABLE_INFO) {
    const rows = await db.all<SyncRow>(`SELECT * FROM ${name} WHERE ${where}`, params);
    if (rows.length === 0) continue;
    tables[name] = rows;
    count += rows.length;
    for (const row of rows) if ((row.updated_at as string) > maxUpdatedAt) maxUpdatedAt = row.updated_at as string;
  }
  return { tables, count, maxUpdatedAt };
}

// ------------------------------------------------------------------
// Merge
// ------------------------------------------------------------------

async function mergeFiles(db: SqlDriver, w: WriteContext, files: SyncFile[]): Promise<number> {
  // Parents may arrive after their children (or from another device's file); check
  // references once everything is in.
  await db.exec("PRAGMA defer_foreign_keys = ON");

  const columnCache = new Map<string, Set<string>>();
  const columnsOf = async (table: string) => {
    let cols = columnCache.get(table);
    if (!cols) {
      cols = new Set((await db.all<{ name: string }>(`PRAGMA table_info(${table})`)).map((c) => c.name));
      columnCache.set(table, cols);
    }
    return cols;
  };

  // Newest copy of each row across all downloaded files.
  const incoming = new Map<string, Map<string, SyncRow>>();
  for (const file of files) {
    for (const table of SYNCED_TABLE_INFO) {
      const rows = file.tables[table.name];
      if (!rows) continue;
      let byKey = incoming.get(table.name);
      if (!byKey) incoming.set(table.name, (byKey = new Map()));
      for (const original of rows) {
        const row = upgradeRow(table.name, original, file.schema_version);
        const key = table.primaryKey.map((c) => row[c]).join("|");
        const prev = byKey.get(key);
        if (!prev || (row.updated_at as string) > (prev.updated_at as string)) byKey.set(key, row);
        w.observe(row.updated_at as string);
      }
    }
  }

  const ctx = new MergeContext(db, w);
  let applied = 0;
  for (const table of SYNCED_TABLE_INFO) {
    const rows = incoming.get(table.name);
    if (!rows) continue;
    const cols = await columnsOf(table.name);
    for (const remote of rows.values()) {
      if (await ctx.applyRow(table, remote, cols)) applied++;
    }
  }
  if (applied > 0) applied += await ctx.repair();

  const violations = await db.all<{ table: string; parent: string }>("PRAGMA foreign_key_check");
  if (violations.length > 0) {
    const sample = violations.slice(0, 3).map((v) => `${v.table} → ${v.parent}`).join(", ");
    throw new Error(`Sync data references rows that don't exist (${violations.length}: ${sample})`);
  }
  return applied;
}

class MergeContext {
  private readonly db: SqlDriver;
  private readonly w: WriteContext;

  constructor(db: SqlDriver, w: WriteContext) {
    this.db = db;
    this.w = w;
  }

  private async first<T>(sql: string, params: SqlValue[]): Promise<T | null> {
    return (await this.db.all<T>(sql, params))[0] ?? null;
  }

  /** Marks a row as rewritten by this device now. */
  private restamp(row: SyncRow): string {
    const stamp = this.w.stamp();
    row.updated_at = stamp;
    row.device_id = this.w.deviceId;
    return stamp;
  }

  /** Applies one remote row if it is newer than the local copy. Returns whether it changed anything. */
  async applyRow(table: SyncedTable, remote: SyncRow, cols: Set<string>): Promise<boolean> {
    const row: SyncRow = {};
    for (const [k, v] of Object.entries(remote)) if (cols.has(k)) row[k] = v;
    for (const c of table.primaryKey) {
      if (typeof row[c] !== "string") throw new Error(`Sync row in ${table.name} has no ${c}`);
    }
    const where = table.primaryKey.map((c) => `${c} = ?`).join(" AND ");
    const keyVals = table.primaryKey.map((c) => row[c]);
    const local = await this.first<{ updated_at: string }>(`SELECT updated_at FROM ${table.name} WHERE ${where}`, keyVals);
    if (local && local.updated_at >= (row.updated_at as string)) return false;

    if (row.deleted_at == null) await this.resolveUniqueConflicts(table.name, row);

    const keys = Object.keys(row);
    const updates = keys.filter((k) => !table.primaryKey.includes(k)).map((k) => `${k} = excluded.${k}`);
    await this.db.run(
      `INSERT INTO ${table.name} (${keys.join(", ")}) VALUES (${keys.map(() => "?").join(", ")})
       ON CONFLICT(${table.primaryKey.join(", ")}) DO UPDATE SET ${updates.join(", ")}`,
      keys.map((k) => row[k]),
    );
    return true;
  }

  /** Makes room for a live incoming row under the partial unique indexes. May change `row`. */
  private async resolveUniqueConflicts(table: string, row: SyncRow): Promise<void> {
    const id = row.id as string;
    if (table === "vehicles" && typeof row.vin === "string") {
      const other = await this.first<{ id: string }>(
        "SELECT id FROM vehicles WHERE vin = ? AND deleted_at IS NULL AND id <> ?",
        [row.vin, id],
      );
      if (!other) return;
      if (id < other.id) {
        const stamp = this.w.stamp();
        await this.db.run(
          "UPDATE vehicles SET deleted_at = ?, merged_into = ?, updated_at = ?, device_id = ? WHERE id = ?",
          [stamp, id, stamp, this.w.deviceId, other.id],
        );
      } else {
        row.deleted_at = this.restamp(row);
        row.merged_into = other.id;
      }
      return;
    }

    if (table === "service_types" && typeof row.name === "string") {
      const live = "deleted_at IS NULL";
      const other = await this.first<{ id: string }>(`SELECT id FROM service_types WHERE name = ? AND ${live} AND id <> ?`, [row.name, id]);
      if (other) await this.renameLoser("service_types", row, other.id, live, []);
      return;
    }

    if (table === "custom_fields" && row.archived_at == null && typeof row.name === "string") {
      const active = "service_type_id = ? AND archived_at IS NULL AND deleted_at IS NULL";
      const scope = [row.service_type_id];
      const other = await this.first<{ id: string }>(`SELECT id FROM custom_fields WHERE name = ? AND ${active} AND id <> ?`, [
        row.name, ...scope, id,
      ]);
      if (other) await this.renameLoser("custom_fields", row, other.id, active, scope);
    }
  }

  /** Of the incoming row and a local one with the same name, renames the one with the larger id. */
  private async renameLoser(table: string, row: SyncRow, otherId: string, scopeSql: string, scope: SqlValue[]): Promise<void> {
    const id = row.id as string;
    const base = row.name as string;
    let name = base;
    for (let n = 2; ; n++) {
      name = `${base} (${n})`;
      const taken = await this.first(`SELECT 1 FROM ${table} WHERE name = ? AND ${scopeSql} AND id NOT IN (?, ?)`, [
        name, ...scope, id, otherId,
      ]);
      if (!taken) break;
    }
    if (id > otherId) {
      row.name = name;
      this.restamp(row);
    } else {
      const stamp = this.w.stamp();
      await this.db.run(`UPDATE ${table} SET name = ?, updated_at = ?, device_id = ? WHERE id = ?`, [
        name, stamp, this.w.deviceId, otherId,
      ]);
    }
  }

  /** Moves children of merged vehicles and tombstones children of deleted parents. Returns rows changed. */
  async repair(): Promise<number> {
    let changed = 0;
    const db = this.db;
    const touch = () => {
      const stamp = this.w.stamp();
      return { stamp, device: this.w.deviceId };
    };

    // 1. Children of merged vehicles move to the vehicle they were merged into.
    const merged = new Map(
      (await db.all<{ id: string; merged_into: string }>("SELECT id, merged_into FROM vehicles WHERE merged_into IS NOT NULL")).map(
        (r) => [r.id, r.merged_into],
      ),
    );
    const survivor = (id: string) => {
      for (let i = 0; i < 20 && merged.has(id); i++) id = merged.get(id)!;
      return id;
    };
    if (merged.size > 0) {
      const inMerged = `vehicle_id IN (SELECT id FROM vehicles WHERE merged_into IS NOT NULL)`;
      for (const log of await db.all<{ id: string; vehicle_id: string }>(
        `SELECT id, vehicle_id FROM maintenance_logs WHERE deleted_at IS NULL AND ${inMerged}`,
      )) {
        const t = touch();
        await db.run("UPDATE maintenance_logs SET vehicle_id = ?, updated_at = ?, device_id = ? WHERE id = ?", [
          survivor(log.vehicle_id), t.stamp, t.device, log.id,
        ]);
        changed++;
      }
      for (const reading of await db.all<{ id: string; vehicle_id: string }>(
        `SELECT id, vehicle_id FROM odometer_readings WHERE deleted_at IS NULL AND ${inMerged}`,
      )) {
        const t = touch();
        await db.run("UPDATE odometer_readings SET vehicle_id = ?, updated_at = ?, device_id = ? WHERE id = ?", [
          survivor(reading.vehicle_id), t.stamp, t.device, reading.id,
        ]);
        changed++;
      }
      for (const ov of await db.all<Record<string, SqlValue>>(
        `SELECT * FROM vehicle_service_interval_overrides WHERE deleted_at IS NULL AND ${inMerged}`,
      )) {
        const target = survivor(ov.vehicle_id as string);
        const existing = await this.first<{ deleted_at: string | null }>(
          "SELECT deleted_at FROM vehicle_service_interval_overrides WHERE vehicle_id = ? AND service_type_id = ?",
          [target, ov.service_type_id],
        );
        if (!existing || existing.deleted_at !== null) {
          const t = touch();
          await db.run(
            `INSERT INTO vehicle_service_interval_overrides (id, vehicle_id, service_type_id, override_interval_km,
                                                             override_interval_days, updated_at, deleted_at, device_id)
             VALUES (?, ?, ?, ?, ?, ?, NULL, ?)
             ON CONFLICT(vehicle_id, service_type_id) DO UPDATE SET
               override_interval_km = excluded.override_interval_km,
               override_interval_days = excluded.override_interval_days,
               deleted_at = NULL, updated_at = excluded.updated_at, device_id = excluded.device_id`,
            [intervalOverrideId(target, ov.service_type_id as string), target, ov.service_type_id,
              ov.override_interval_km, ov.override_interval_days, t.stamp, t.device],
          );
          changed++;
        }
        const t = touch();
        await db.run("UPDATE vehicle_service_interval_overrides SET deleted_at = ?, updated_at = ?, device_id = ? WHERE id = ?", [
          t.stamp, t.stamp, t.device, ov.id,
        ]);
        changed++;
      }
    }

    // 2. Children of deleted parents follow them (the cascades the repository does on delete).
    const deadVehicle = "SELECT id FROM vehicles WHERE deleted_at IS NOT NULL";
    const deadType = "SELECT id FROM service_types WHERE deleted_at IS NOT NULL";
    const cascades: [string, string][] = [
      ["custom_fields", `service_type_id IN (${deadType})`],
      ["maintenance_logs", `vehicle_id IN (${deadVehicle})`],
      ["odometer_readings", `vehicle_id IN (${deadVehicle})`],
      ["custom_field_values", `log_id IN (SELECT id FROM maintenance_logs WHERE deleted_at IS NOT NULL)
                               OR field_id IN (SELECT id FROM custom_fields WHERE deleted_at IS NOT NULL)`],
      ["vehicle_service_interval_overrides", `vehicle_id IN (${deadVehicle}) OR service_type_id IN (${deadType})`],
      ["service_type_resets", `parent_id IN (${deadType}) OR reset_id IN (${deadType})`],
      ["service_type_suggestions", `parent_id IN (${deadType}) OR suggestion_id IN (${deadType})`],
    ];
    for (const [table, condition] of cascades) {
      changed += await this.updateCounting(table, "deleted_at = ?, updated_at = ?, device_id = ?", condition, (t) => [t.stamp, t.stamp, t.device]);
    }
    changed += await this.updateCounting(
      "maintenance_logs",
      "service_type_id = NULL, updated_at = ?, device_id = ?",
      `service_type_id IN (${deadType})`,
      (t) => [t.stamp, t.device],
    );
    return changed;
  }

  /** `UPDATE table SET <set> WHERE deleted_at IS NULL AND (<condition>)`, returning how many rows matched. */
  private async updateCounting(
    table: string,
    set: string,
    condition: string,
    values: (t: { stamp: string; device: string }) => SqlValue[],
  ): Promise<number> {
    const where = `deleted_at IS NULL AND (${condition})`;
    const [{ n }] = await this.db.all<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE ${where}`, []);
    if (n === 0) return 0;
    const stamp = this.w.stamp();
    await this.db.run(`UPDATE ${table} SET ${set} WHERE ${where}`, values({ stamp, device: this.w.deviceId }));
    return n;
  }
}
