import type { Id, UpcomingMaintenanceItemData } from "../types";

/** A service becomes "Upcoming" this many days before its due date. */
export const UPCOMING_THRESHOLD_DAYS = 30;
/** A service becomes "Upcoming" this many km before its due mileage. */
export const UPCOMING_THRESHOLD_KM = 1000;

const MS_PER_DAY = 1000 * 60 * 60 * 24;

const STATUS_PRIORITY: Record<UpcomingMaintenanceItemData["status"], number> = {
  Overdue: 0,
  Upcoming: 1,
  NeverDone: 2,
  OK: 3,
  NoInterval: 4,
};

/** Parses a "YYYY-MM-DD" date as local midnight (not UTC midnight). */
function parseLocalDate(value: string): Date {
  return new Date(`${value}T00:00:00`);
}

function formatDate(date: Date): string {
  if (isNaN(date.getTime())) return "N/A";
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// The engine only needs these fields, so it accepts both the UUID types and the desktop's
// legacy integer-id types (`TId` = number) until roadmap step 4.
interface EngineVehicle<TId> {
  initial_mileage?: number | null;
  acquisition_date?: string | null;
  /** Newest first. */
  maintenance_logs?: { mileage: number }[];
  interval_overrides?: {
    service_type_id: TId;
    override_interval_km?: number | null;
    override_interval_days?: number | null;
  }[];
}

interface EngineServiceType<TId> {
  id: TId;
  name: string;
  recommended_interval_km?: number | null;
  recommended_interval_days?: number | null;
  resets?: TId[];
}

interface EngineServiceTypeSummary<TId> {
  service_type_id: TId;
  last_log_date?: string | null;
  last_log_mileage?: number | null;
}

export interface ComputeUpcomingMaintenanceInput<TId extends string | number = Id> {
  vehicle: EngineVehicle<TId> | null | undefined;
  serviceTypeSummaries: EngineServiceTypeSummary<TId>[];
  allServiceTypes: EngineServiceType<TId>[];
  /** The day to compute against. Defaults to now; tests pass a fixed date. */
  today?: Date;
}

/**
 * Works out, for every service type with an interval, whether it is overdue, coming up,
 * never done or fine for this vehicle. Results are sorted Overdue → Upcoming → NeverDone → OK.
 *
 * - The interval is the vehicle's override if set, otherwise the service type's recommendation.
 * - A service counts as performed when it was logged itself or when a service type that
 *   `resets` it was logged; the most recent date and highest mileage win.
 * - Current mileage is the mileage of the newest log (logs arrive newest first),
 *   falling back to the vehicle's initial mileage.
 * - Never-performed services are measured from the acquisition date / initial mileage.
 */
export function computeUpcomingMaintenance<TId extends string | number = Id>({
  vehicle,
  serviceTypeSummaries,
  allServiceTypes,
  today: todayInput,
}: ComputeUpcomingMaintenanceInput<TId>): UpcomingMaintenanceItemData<TId>[] {
  if (!vehicle || !allServiceTypes.length) {
    return [];
  }

  const latestLog = vehicle.maintenance_logs?.[0];
  const currentMileage = latestLog?.mileage ?? vehicle.initial_mileage ?? 0;
  const vehicleIntervalOverrides = vehicle.interval_overrides ?? [];

  const today = new Date(todayInput ?? new Date());
  today.setHours(0, 0, 0, 0);

  const items = allServiceTypes
    .map((st): UpcomingMaintenanceItemData<TId> | null => {
      const summary = serviceTypeSummaries.find((s) => s.service_type_id === st.id);
      let lastPerformedDate = summary?.last_log_date ? parseLocalDate(summary.last_log_date) : null;
      let lastPerformedMileage = summary?.last_log_mileage ?? null;

      // A service is also "performed" when a service type that resets it was logged more recently.
      const resettingServiceTypes = allServiceTypes.filter((parentSt) => parentSt.resets?.includes(st.id));

      for (const resettingSt of resettingServiceTypes) {
        const resettingSummary = serviceTypeSummaries.find((s) => s.service_type_id === resettingSt.id);

        if (resettingSummary?.last_log_date) {
          const resetDate = parseLocalDate(resettingSummary.last_log_date);
          if (!lastPerformedDate || resetDate > lastPerformedDate) {
            lastPerformedDate = resetDate;
          }
        }

        if (resettingSummary?.last_log_mileage != null) {
          if (lastPerformedMileage == null || resettingSummary.last_log_mileage > lastPerformedMileage) {
            lastPerformedMileage = resettingSummary.last_log_mileage;
          }
        }
      }

      const override = vehicleIntervalOverrides.find((ov) => ov.service_type_id === st.id);
      const intervalDays = override?.override_interval_days ?? st.recommended_interval_days;
      const intervalKm = override?.override_interval_km ?? st.recommended_interval_km;

      if (!intervalDays && !intervalKm) {
        return null; // Skip services with no defined interval
      }

      const baseDate =
        lastPerformedDate || (vehicle.acquisition_date ? parseLocalDate(vehicle.acquisition_date) : null);
      const baseMileage = lastPerformedMileage ?? vehicle.initial_mileage;

      let status: UpcomingMaintenanceItemData["status"];
      let message: string;
      let byDateInfo: NonNullable<UpcomingMaintenanceItemData["details"]>["byDate"] | undefined;
      let byMileageInfo: NonNullable<UpcomingMaintenanceItemData["details"]>["byMileage"] | undefined;
      let overdueByDate = false;
      let upcomingByDate = false;
      let overdueByMileage = false;
      let upcomingByMileage = false;

      // Date calculation
      if (intervalDays && baseDate) {
        const dueDate = new Date(baseDate);
        dueDate.setDate(dueDate.getDate() + intervalDays);
        const remainingDays = Math.ceil((dueDate.getTime() - today.getTime()) / MS_PER_DAY);
        byDateInfo = { due: formatDate(dueDate), remainingDays };
        if (remainingDays <= 0) overdueByDate = true;
        else if (remainingDays <= UPCOMING_THRESHOLD_DAYS) upcomingByDate = true;
      }

      // Mileage calculation
      if (intervalKm && typeof baseMileage === "number") {
        const dueMileage = baseMileage + intervalKm;
        const remainingKm = dueMileage - currentMileage;
        byMileageInfo = { due: dueMileage, remainingKm };
        if (remainingKm <= 0) overdueByMileage = true;
        else if (remainingKm <= UPCOMING_THRESHOLD_KM) upcomingByMileage = true;
      }

      // Determine status
      if (!lastPerformedDate && lastPerformedMileage == null) {
        status = "NeverDone";
        message = "No record of this service being performed.";
      } else if (overdueByDate || overdueByMileage) {
        status = "Overdue";
        if (overdueByDate && overdueByMileage) {
          message = `Overdue by ${Math.abs(byDateInfo!.remainingDays)} days and ${Math.abs(byMileageInfo!.remainingKm).toLocaleString()} km`;
        } else if (overdueByDate) {
          message = `Overdue by ${Math.abs(byDateInfo!.remainingDays)} days`;
        } else {
          message = `Overdue by ${Math.abs(byMileageInfo!.remainingKm).toLocaleString()} km`;
        }
      } else if (upcomingByDate || upcomingByMileage) {
        status = "Upcoming";
        if (upcomingByDate && upcomingByMileage) {
          message = `Due in ${byDateInfo!.remainingDays} days or ${byMileageInfo!.remainingKm.toLocaleString()} km`;
        } else if (upcomingByDate) {
          message = `Due in ${byDateInfo!.remainingDays} days`;
        } else {
          message = `Due in ${byMileageInfo!.remainingKm.toLocaleString()} km`;
        }
      } else {
        status = "OK";
        const dueParts: string[] = [];
        if (byDateInfo) dueParts.push(`in ${byDateInfo.remainingDays} days`);
        if (byMileageInfo) dueParts.push(`in ${byMileageInfo.remainingKm.toLocaleString()} km`);
        message = dueParts.length ? `Next due ${dueParts.join(" or ")}` : "Up to date";
      }

      return {
        serviceTypeId: st.id,
        serviceTypeName: st.name,
        status,
        message,
        details: {
          byDate: byDateInfo,
          byMileage: byMileageInfo,
          lastPerformed: {
            date: lastPerformedDate ? formatDate(lastPerformedDate) : null,
            mileage: lastPerformedMileage,
          },
        },
      };
    })
    .filter((item): item is UpcomingMaintenanceItemData<TId> => item !== null);

  return items.sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]);
}
