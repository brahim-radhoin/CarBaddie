import { useMemo } from "react";
import type {
  ServiceTypeRead,
  ServiceTypeLogSummary,
  UpcomingMaintenanceItemData,
  VehicleRead,
} from "../types";

const UPCOMING_THRESHOLD_DAYS = 30;
const UPCOMING_THRESHOLD_KM = 1000;

const formatDate = (dateInput?: Date | string | null): string => {
  if (!dateInput) return "N/A";
  const dateObj = typeof dateInput === "string" ? new Date(`${dateInput}T00:00:00`) : dateInput;
  if (isNaN(dateObj.getTime())) return "N/A";
  return dateObj.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

interface UseUpcomingMaintenanceProps {
  vehicle: VehicleRead | null | undefined;
  serviceTypeSummaries: ServiceTypeLogSummary[];
  allServiceTypes: ServiceTypeRead[];
}

export function useUpcomingMaintenance({
  vehicle,
  serviceTypeSummaries,
  allServiceTypes,
}: UseUpcomingMaintenanceProps): UpcomingMaintenanceItemData[] {
  return useMemo((): UpcomingMaintenanceItemData[] => {
    if (!vehicle || !allServiceTypes.length) {
      return [];
    }

    const latestLog = vehicle.maintenance_logs?.[0];
    const currentMileage = latestLog?.mileage ?? vehicle.initial_mileage ?? 0;
    const vehicleIntervalOverrides = vehicle.interval_overrides ?? [];

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const items = allServiceTypes
      .map((st): UpcomingMaintenanceItemData | null => {
        const summary = serviceTypeSummaries.find((s) => s.service_type_id === st.id);
        let lastPerformedDate = summary?.last_log_date ? new Date(`${summary.last_log_date}T00:00:00`) : null;
        let lastPerformedMileage = summary?.last_log_mileage ?? null;

        // Check if this service was reset by another service more recently
        const resettingServiceTypes = allServiceTypes.filter((parentSt) => parentSt.resets?.includes(st.id));

        for (const resettingSt of resettingServiceTypes) {
          const resettingSummary = serviceTypeSummaries.find((s) => s.service_type_id === resettingSt.id);

          if (resettingSummary?.last_log_date) {
            const resetDate = new Date(`${resettingSummary.last_log_date}T00:00:00`);
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

        const baseDate = lastPerformedDate || (vehicle.acquisition_date ? new Date(`${vehicle.acquisition_date}T00:00:00`) : null);
        const baseMileage = lastPerformedMileage ?? vehicle.initial_mileage;

        let status: UpcomingMaintenanceItemData["status"] = "OK";
        let message = "Service is up to date.";
        let byDateInfo: NonNullable<UpcomingMaintenanceItemData["details"]>["byDate"] | undefined;
        let byMileageInfo: NonNullable<UpcomingMaintenanceItemData["details"]>["byMileage"] | undefined;
        let overdueByDate = false, upcomingByDate = false;
        let overdueByMileage = false, upcomingByMileage = false;

        // Date calculation
        if (intervalDays && baseDate) {
          const dueDate = new Date(baseDate);
          dueDate.setDate(dueDate.getDate() + intervalDays);
          const diffTime = dueDate.getTime() - today.getTime();
          const remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
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
      .filter((item): item is UpcomingMaintenanceItemData => item !== null);

    // Sort: Overdue first, then Upcoming, then NeverDone, then OK
    const priority: Record<UpcomingMaintenanceItemData["status"], number> = {
      Overdue: 0,
      Upcoming: 1,
      NeverDone: 2,
      OK: 3,
      NoInterval: 4,
    };

    return items.sort((a, b) => priority[a.status] - priority[b.status]);
  }, [vehicle, serviceTypeSummaries, allServiceTypes]);
}

