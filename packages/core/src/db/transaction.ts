// Transactions over a single-connection driver. SQLite has one transaction per connection,
// so transactions are queued: a second one waits for the first to finish instead of
// silently joining it. Never start a transaction from inside another (it would wait forever).

import type { SqlDriver } from "./driver";

const queues = new WeakMap<SqlDriver, Promise<unknown>>();

export function transaction<T>(db: SqlDriver, fn: () => Promise<T>): Promise<T> {
  const previous = queues.get(db) ?? Promise.resolve();
  const run = previous.then(async () => {
    await db.exec("BEGIN");
    try {
      const result = await fn();
      await db.exec("COMMIT");
      return result;
    } catch (error) {
      await db.exec("ROLLBACK");
      throw error;
    }
  });
  // The queue continues whether this transaction succeeded or not.
  queues.set(db, run.catch(() => undefined));
  return run;
}
