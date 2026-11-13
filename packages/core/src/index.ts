// Public API of @carbaddie/core.
//
// The apps import this package as TypeScript source (no build step). Keep source
// files free of runtime imports between each other unless they use an explicit
// `.ts` extension, so the tests can run directly with `node --test`.

export type * from "./types";

export {
  computeUpcomingMaintenance,
  UPCOMING_THRESHOLD_DAYS,
  UPCOMING_THRESHOLD_KM,
} from "./maintenance/upcoming";
export type { ComputeUpcomingMaintenanceInput } from "./maintenance/upcoming";

export { vehicleIdentityKey } from "./vehicles/identity";

export { uuidv7, uuidv5, isUuid, intervalOverrideId, setRandomSource, ID_NAMESPACES } from "./ids/uuid";
export type { RandomBytes } from "./ids/uuid";

export { HlcClock, formatHlc, parseHlc, tickHlc, receiveHlc } from "./sync/hlc";
export type { Hlc } from "./sync/hlc";

export {
  BUILTIN_SERVICE_TYPES,
  BUILTIN_RESETS,
  BUILTIN_SUGGESTIONS,
  builtinServiceTypeId,
  findBuiltinServiceTypeByName,
} from "./service-types/builtin";
export type { BuiltinServiceType } from "./service-types/builtin";

export { backupFileSchema, parseBackup, encodeBackup } from "./backup/format";
export type { BackupFile, EncodeBackupInput } from "./backup/format";

export type { SqlDriver, SqlValue, WriteContext } from "./db/driver";
export { migrate, getSchemaVersion, MIGRATIONS, LATEST_SCHEMA_VERSION } from "./db/migrations";
export { seedBuiltinServiceTypes } from "./db/seed";
export { createRepository } from "./db/repository";
export type { Repository } from "./db/repository";
export { openRepository, SYNCED_TABLES } from "./db/open";
export type { OpenedDatabase } from "./db/open";
export { transaction } from "./db/transaction";
export type { SeedOptions } from "./db/seed";

export { ValidationError, normaliseVin, validateVehicle, validateServiceType, validateIntervalOverride } from "./validation";
