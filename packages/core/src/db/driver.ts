// The minimum a SQLite connection must offer for the shared migrations and seed.
// Mobile adapts expo-sqlite to it, desktop its rusqlite commands, tests node:sqlite.

export type SqlValue = string | number | null;

export interface SqlDriver {
  /** Runs one or more statements without parameters. */
  exec(sql: string): Promise<void>;
  all<T = Record<string, unknown>>(sql: string, params?: SqlValue[]): Promise<T[]>;
  run(sql: string, params?: SqlValue[]): Promise<void>;
}

/** What every write needs to stamp the sync columns of a row. */
export interface WriteContext {
  deviceId: string;
  /** Next hybrid-logical-clock timestamp (see sync/hlc.ts). */
  stamp(): string;
  /** A fresh row id (UUIDv7). */
  newId(): string;
  /** Advances the clock past a timestamp received from another device. */
  observe(stamp: string): void;
}
