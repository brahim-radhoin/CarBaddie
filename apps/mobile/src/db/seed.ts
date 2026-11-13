import { getRepository } from "./schema";

/**
 * "Load defaults": restores the built-in service types (see @carbaddie/core
 * service-types/builtin.ts), including ones the user deleted. Returns how many were added.
 */
export async function restoreDefaultServiceTypes(): Promise<number> {
  return (await getRepository()).restoreDefaultServiceTypes();
}
