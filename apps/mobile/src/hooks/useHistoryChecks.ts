// What a form needs to stop bad history before it is saved: the dates a vehicle's history can
// have (not later than today, not before its model year) and a warning when a typed odometer
// reading is out of step with the others. Core still enforces the date rules (validation.ts);
// the odometer warning never blocks, since odometers get replaced.
import { useMemo } from "react";
import { describeOdometerConflict, odometerConflict, odometerRecords, parseWholeNumber, todayISO, vehicleStartDate } from "@carbaddie/core";
import { useUnits } from "@/src/hooks/useUnits";
import type { VehicleRead } from "@/src/types";

export function useHistoryChecks(
  vehicle: VehicleRead | null | undefined,
  skip: { visitId?: string; logId?: string; readingId?: string } = {},
) {
  const units = useUnits();
  const { visitId, logId, readingId } = skip;
  const records = useMemo(
    () => (vehicle ? odometerRecords(vehicle, { visitId, logId, readingId }) : []),
    [vehicle, visitId, logId, readingId]
  );
  return {
    minDate: vehicleStartDate(vehicle?.year) ?? undefined,
    maxDate: todayISO(),
    /** For a reading typed in the display unit; null when it fits or isn't a number yet. */
    odometerWarning(date: string, typed: string, previousKm?: number | null): string | null {
      const n = parseWholeNumber(typed);
      if (n === null) return null;
      const conflict = odometerConflict(date, units.fromDisplay(n, previousKm), records);
      return conflict ? describeOdometerConflict(conflict, units.distance) : null;
    },
  };
}
