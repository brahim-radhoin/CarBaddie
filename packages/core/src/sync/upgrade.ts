// Brings rows from a device on an older schema up to this one before they are merged.
// (Files from a newer schema are refused instead: see engine.ts.)

import type { SyncRow } from "./files";

/** Returns the row as this schema expects it. `fromVersion` is the schema of the file it came in. */
export function upgradeRow(table: string, row: SyncRow, fromVersion: number): SyncRow {
  if (fromVersion < 5 && table === "maintenance_logs" && !("cost_cents" in row)) {
    // v5: `cost` (a decimal) became `cost_cents`.
    const { cost, ...rest } = row;
    return { ...rest, cost_cents: Math.round(Number(cost ?? 0) * 100) };
  }
  return row;
}
