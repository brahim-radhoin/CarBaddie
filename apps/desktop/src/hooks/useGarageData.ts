import { useMemo } from "react";
import { drawableBodyType, groupByZone, SILHOUETTES, type DrawnZoneId } from "@carbaddie/core";
import { useServiceTypes, useServiceTypeSummaries } from "../api";
import type { VehicleRead } from "../types";
import { useUnits } from "./useUnits";
import { useUpcomingMaintenance } from "./useUpcomingMaintenance";

/**
 * Everything the outline needs about one vehicle: its services from the due-date engine, grouped
 * by the part they belong to. The same grouping as the phone's garage card (mobile Garage.tsx).
 */
export function useGarageData(vehicle: VehicleRead) {
  const { data: summaries = [] } = useServiceTypeSummaries(vehicle.id);
  const { data: types = [] } = useServiceTypes();
  const { unit } = useUnits();
  const items = useUpcomingMaintenance({ vehicle, serviceTypeSummaries: summaries, allServiceTypes: types, distanceUnit: unit });
  return useMemo(() => {
    const bodyType = drawableBodyType(vehicle.body_type, vehicle.make);
    const art = SILHOUETTES[bodyType];
    const services = items.map((i) => ({
      serviceTypeId: i.serviceTypeId,
      name: i.serviceTypeName,
      status: i.status,
      message: i.message,
      slug: types.find((t) => t.id === i.serviceTypeId)?.slug ?? null,
    }));
    const groups = groupByZone(services, Object.keys(art.zones) as DrawnZoneId[], art.alias);
    const due = items
      .filter((i) => i.status === "Overdue" || i.status === "Upcoming")
      .sort((a, b) => (a.status === b.status ? 0 : a.status === "Overdue" ? -1 : 1));
    return { bodyType, art, items, groups, due };
  }, [items, types, vehicle.body_type, vehicle.make]);
}
