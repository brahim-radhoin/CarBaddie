// Columns this app does not know yet, kept so they are not lost.
//
// A newer app can add a column to a synced table (an "additive" migration, db/migrations.ts).
// This app still receives the whole row. It stores the columns it knows in the table and the
// rest here, then adds them back when it re-sends the row, so a device that is behind never
// strips what a device that is ahead wrote. Once this app is updated and has the column,
// `adoptExtras` moves the value into it.
//
// Local only: this table is never synced.

import { SYNCED_TABLE_INFO } from "./tables.ts";
import type { SqlDriver } from "../db/driver";
import type { SyncRow } from "./files";

export const rowKey = (primaryKey: readonly string[], row: Record<string, unknown>): string => primaryKey.map((c) => row[c]).join("|");

/** Remember `unknown` columns for a row, keeping what was stored before for other columns. */
export async function saveExtras(db: SqlDriver, table: string, key: string, unknown: SyncRow): Promise<void> {
  if (Object.keys(unknown).length === 0) return;
  const [stored] = await db.all<{ data: string }>("SELECT data FROM sync_extra WHERE table_name = ? AND row_key = ?", [table, key]);
  const merged = { ...(stored ? (JSON.parse(stored.data) as SyncRow) : {}), ...unknown };
  await db.run("INSERT OR REPLACE INTO sync_extra (table_name, row_key, data) VALUES (?, ?, ?)", [table, key, JSON.stringify(merged)]);
}

/** Adds the stored unknown columns to rows about to be sent. Columns the row already has win. */
export async function withExtras(db: SqlDriver, table: string, primaryKey: readonly string[], rows: SyncRow[]): Promise<SyncRow[]> {
  if (rows.length === 0) return rows;
  const stored = await db.all<{ row_key: string; data: string }>("SELECT row_key, data FROM sync_extra WHERE table_name = ?", [table]);
  if (stored.length === 0) return rows;
  const byKey = new Map(stored.map((s) => [s.row_key, JSON.parse(s.data) as SyncRow]));
  return rows.map((row) => {
    const extra = byKey.get(rowKey(primaryKey, row));
    return extra ? { ...extra, ...row } : row;
  });
}

/**
 * After a migration added a column that earlier syncs delivered as an unknown one, copy the
 * stored values into it (only where it is still empty) and forget them here. Does not touch
 * `updated_at`: every device holds the same write, so none of them has a newer copy.
 */
export async function adoptExtras(db: SqlDriver): Promise<void> {
  const [any] = await db.all("SELECT 1 FROM sync_extra LIMIT 1");
  if (!any) return;
  for (const { name, primaryKey } of SYNCED_TABLE_INFO) {
    const stored = await db.all<{ row_key: string; data: string }>("SELECT row_key, data FROM sync_extra WHERE table_name = ?", [name]);
    if (stored.length === 0) continue;
    const columns = new Set((await db.all<{ name: string }>(`PRAGMA table_info(${name})`)).map((c) => c.name));
    for (const { row_key, data } of stored) {
      const extra = JSON.parse(data) as SyncRow;
      const adopt = Object.keys(extra).filter((k) => columns.has(k) && !(primaryKey as readonly string[]).includes(k));
      if (adopt.length === 0) continue;
      const keyValues = row_key.split("|");
      const where = primaryKey.map((c) => `${c} = ?`).join(" AND ");
      for (const column of adopt) {
        await db.run(`UPDATE ${name} SET ${column} = ? WHERE ${where} AND ${column} IS NULL`, [extra[column], ...keyValues]);
        delete extra[column];
      }
      if (Object.keys(extra).length === 0) await db.run("DELETE FROM sync_extra WHERE table_name = ? AND row_key = ?", [name, row_key]);
      else await db.run("UPDATE sync_extra SET data = ? WHERE table_name = ? AND row_key = ?", [JSON.stringify(extra), name, row_key]);
    }
  }
}
