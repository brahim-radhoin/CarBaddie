import { useMemo } from "react";
import {
  ServiceTypeRead,
  ServiceTypeLogSummary,
  UpcomingMaintenanceItemData,
  VehicleRead as Vehicle,
} from "../types";
import { VehicleStatsData } from "../components/VehicleStatistics"; // Adjust path if needed

const UPCOMING_THRESHOLD_DAYS = 30;
const UPCOMING_THRESHOLD_KM = 1000; // Let's use a more realistic threshold

// Helper to format date
const formatDate = (dateInput?: Date | string | null): string => {
  if (!dateInput) return "N/A";
  const dateObj = typeof dateInput === 'string' ? new Date(`${dateInput}T00:00:00`) : dateInput;
  if (isNaN(dateObj.getTime())) return "N/A";
  return dateObj.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

// Simplified props interface
interface UseUpcomingMaintenanceProps {
  vehicle: Vehicle | null | undefined;
  vehicleStats: VehicleStatsData | null;
  serviceTypeSummaries: ServiceTypeLogSummary[];
  allServiceTypes: ServiceTypeRead[];
}

export function useUpcomingMaintenance({
  vehicle,
  vehicleStats,
  serviceTypeSummaries,
  allServiceTypes,
}: UseUpcomingMaintenanceProps): UpcomingMaintenanceItemData[] {
  return useMemo((): UpcomingMaintenanceItemData[] => {
    // Check for all required data. `vehicle.interval_overrides` is now the source of truth.
    if (!vehicle || !vehicleStats || !allServiceTypes.length || typeof vehicleStats.currentMileage !== "number") {
      return [];
    }
    
    const { currentMileage } = vehicleStats;
    const { interval_overrides: vehicleIntervalOverrides } = vehicle; // Get overrides from the vehicle object
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return allServiceTypes
      .map((st): UpcomingMaintenanceItemData | null => {
        const summary = serviceTypeSummaries.find((s) => s.service_type_id === st.id);
        const lastPerformedDate = summary?.last_log_date ? new Date(`${summary.last_log_date}T00:00:00`) : null;
        const lastPerformedMileage = summary?.last_log_mileage ?? null;

        const override = vehicleIntervalOverrides.find((ov) => ov.service_type_id === st.id);

        const intervalDays = override?.override_interval_days ?? st.recommended_interval_days;
        const intervalKm = override?.override_interval_km ?? st.recommended_interval_km;

        if (!intervalDays && !intervalKm) {
          return null; // Don't show services with no defined interval
        }
        
        // --- Base values for "Never Done" calculation ---
        const baseDate = lastPerformedDate || (vehicle.acquisition_date ? new Date(`${vehicle.acquisition_date}T00:00:00`) : null);
        const baseMileage = lastPerformedMileage ?? vehicle.initial_mileage;

        let status: UpcomingMaintenanceItemData["status"] = "OK";
        let message = "Service is up to date.";
        let byDateInfo: UpcomingMaintenanceItemData["details"]["byDate"] | undefined;
        let byMileageInfo: UpcomingMaintenanceItemData["details"]["byMileage"] | undefined;
        let overdueByDate = false, upcomingByDate = false;
        let overdueByMileage = false, upcomingByMileage = false;

        // --- Date-based Calculation ---
        if (intervalDays && baseDate) {
          const dueDate = new Date(baseDate);
          dueDate.setDate(dueDate.getDate() + intervalDays);
          const diffTime = dueDate.getTime() - today.getTime();
          const remainingDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
          byDateInfo = { due: formatDate(dueDate), remainingDays };
          if (remainingDays <= 0) overdueByDate = true;
          else if (remainingDays <= UPCOMING_THRESHOLD_DAYS) upcomingByDate = true;
        }

        // --- Mileage-based Calculation ---
        if (intervalKm && typeof baseMileage === 'number') {
          const dueMileage = baseMileage + intervalKm;
          const remainingKm = dueMileage - currentMileage;
          byMileageInfo = { due: dueMileage, remainingKm };
          if (remainingKm <= 0) overdueByMileage = true;
          else if (remainingKm <= UPCOMING_THRESHOLD_KM) upcomingByMileage = true;
        }

        // --- Determine Final Status & Message ---
        if (!summary) {
            status = "NeverDone";
            let estMsg = "";
            if(byDateInfo) estMsg += ` Est. due ${byDateInfo.due}.`;
            if(byMileageInfo) estMsg += ` Est. due at ${byMileageInfo.due.toLocaleString()} km.`;
            message = estMsg ? `Never performed.${estMsg}` : "Interval set, but never performed.";
        }
        else if (overdueByDate || overdueByMileage) {
          status = "Overdue";
          const dateMsg = overdueByDate ? `by date (${Math.abs(byDateInfo?.remainingDays || 0)} days ago)` : "";
          const kmMsg = overdueByMileage ? `by mileage (${Math.abs(byMileageInfo?.remainingKm || 0).toLocaleString()} km ago)`: "";
          message = `Overdue ${[dateMsg, kmMsg].filter(Boolean).join(" and ")}.`;
        } else if (upcomingByDate || upcomingByMileage) {
          status = "Upcoming";
          const dateMsg = upcomingByDate ? `in ${byDateInfo?.remainingDays} days` : "";
          const kmMsg = upcomingByMileage ? `in ${byMileageInfo?.remainingKm?.toLocaleString()} km` : "";
          message = `Upcoming ${[dateMsg, kmMsg].filter(Boolean).join(" or ")}.`;
        }
        
        // Only return actionable items
        if (status === "OK") {
          return null;
        }

        return {
          serviceTypeId: st.id,
          serviceTypeName: st.name,
          status,
          message,
          details: {
            byDate: byDateInfo,
            byMileage: byMileageInfo,
            lastPerformed: { date: summary?.last_log_date, mileage: lastPerformedMileage },
          },
        };
      })
      .filter((item): item is UpcomingMaintenanceItemData => item !== null);
  }, [vehicle, vehicleStats, serviceTypeSummaries, allServiceTypes]);
}