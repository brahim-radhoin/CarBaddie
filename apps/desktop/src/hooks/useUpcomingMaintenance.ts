import { useMemo } from "react";
import { computeUpcomingMaintenance, type ComputeUpcomingMaintenanceInput } from "@carbaddie/core";
import type { UpcomingMaintenanceItemData } from "../types";

/** React wrapper around the shared due-date engine in @carbaddie/core. */
export function useUpcomingMaintenance({
  vehicle,
  serviceTypeSummaries,
  allServiceTypes,
}: Omit<ComputeUpcomingMaintenanceInput<number>, "today">): UpcomingMaintenanceItemData[] {
  return useMemo(
    () => computeUpcomingMaintenance({ vehicle, serviceTypeSummaries, allServiceTypes }),
    [vehicle, serviceTypeSummaries, allServiceTypes],
  );
}
