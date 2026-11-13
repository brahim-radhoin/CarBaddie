import { seedBuiltinServiceTypes } from "@carbaddie/core";
import { asSqlDriver, getDatabase, getWriteContext } from "./schema";

/**
 * "Load defaults": restores the built-in service types (see @carbaddie/core
 * service-types/builtin.ts), including ones the user deleted. Returns how many were added.
 */
export async function restoreDefaultServiceTypes(): Promise<number> {
  const db = await getDatabase();
  const ctx = await getWriteContext();
  let count = 0;
  await db.withTransactionAsync(async () => {
    count = await seedBuiltinServiceTypes(asSqlDriver(db), ctx, { force: true });
  });
  return count;
}
