import { useMemo } from "react";
import { computeUpcomingMaintenance, type ComputeUpcomingMaintenanceInput } from "@carbaddie/core";
import type { UpcomingMaintenanceItemData } from "../types";
import { useUnits } from "./useUnits";

/** React wrapper around the shared due-date engine in @carbaddie/core. */
export function useUpcomingMaintenance({
  vehicle,
  serviceTypeSummaries,
  allServiceTypes,
}: Omit<ComputeUpcomingMaintenanceInput, "today" | "distanceUnit">): UpcomingMaintenanceItemData[] {
  const { unit } = useUnits();
  return useMemo(
    () => computeUpcomingMaintenance({ vehicle, serviceTypeSummaries, allServiceTypes, distanceUnit: unit }),
    [vehicle, serviceTypeSummaries, allServiceTypes, unit],
  );
}
