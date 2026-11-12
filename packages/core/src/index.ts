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
