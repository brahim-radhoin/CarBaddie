// node:sqlite adapter for running the shared migrations and seed in tests.
import { DatabaseSync } from "node:sqlite";
import { HlcClock } from "../../src/sync/hlc.ts";
import { uuidv7 } from "../../src/ids/uuid.ts";
import type { SqlDriver, SqlValue, WriteContext } from "../../src/db/driver.ts";

export interface TestDb extends SqlDriver {
  raw: DatabaseSync;
  close(): void;
}

/** Opens with foreign keys OFF, like expo-sqlite and the old apps (node:sqlite defaults to ON). */
export function openTestDb(path = ":memory:"): TestDb {
  const raw = new DatabaseSync(path, { enableForeignKeyConstraints: false });
  return {
    raw,
    async exec(sql: string) {
      raw.exec(sql);
    },
    async all<T>(sql: string, params: SqlValue[] = []) {
      // Plain objects, so deepEqual against literals works.
      return raw.prepare(sql).all(...params).map((row) => ({ ...row })) as T[];
    },
    async run(sql: string, params: SqlValue[] = []) {
      raw.prepare(sql).run(...params);
    },
    close: () => raw.close(),
  };
}

export function testContext(deviceId = "0190a0a0-0000-7000-8000-000000000001", startMs = 1_760_000_000_000): WriteContext {
  let wall = startMs;
  const clock = new HlcClock(deviceId, null, () => wall);
  return {
    deviceId,
    stamp: () => clock.now(),
    newId: () => uuidv7(wall++),
    observe: (stamp) => clock.observe(stamp),
  };
}
