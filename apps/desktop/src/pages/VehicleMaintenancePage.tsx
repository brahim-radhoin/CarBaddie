import { useState, useMemo, useRef } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { VehicleDetailContext } from "./VehicleDetailPage";
import {
  useAllLogsForVehicle,
  useServiceTypeSummaries,
  useServiceTypes,
  useDeleteMaintenanceLog,
  useVisitsForVehicle,
  useDeleteServiceEvent,
} from "../api";
import { ActivityTimeline } from "../components/ActivityTimeline";
import { LogHistoryList } from "../components/LogHistoryList";
import { VehicleStatistics, VehicleStatsData } from "../components/VehicleStatistics";
import { UpdateOdometerPopover } from "../components/UpdateOdometerPopover";
import { useUnits } from "../hooks/useUnits";
import { STATUS_LABEL, daysBetweenISO, formatISO, parseISO, summariseStatuses, todayISO } from "@carbaddie/core";
import { useUpcomingMaintenance } from "../hooks/useUpcomingMaintenance";
import { VehiclePartsPanel } from "../components/Garage";

// UI Components
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// Icons
import { ChevronRight, Plus } from "lucide-react";
import { SegmentedControl } from "@/components/interior/segmented-control";

export function VehicleMaintenancePage() {
  const { vehicle } = useOutletContext<VehicleDetailContext>();
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const navigate = useNavigate();

  const { data: allLogs = [], isLoading: isLoadingLogs } = useAllLogsForVehicle(vehicleId);
  const { data: serviceTypeSummaries = [], isLoading: isLoadingSummaries } = useServiceTypeSummaries(vehicleId);
  const { data: allServiceTypes = [], isLoading: isLoadingTypes } = useServiceTypes();
  const { data: visits = [], isLoading: isLoadingVisits } = useVisitsForVehicle(vehicleId);
  const deleteLogMutation = useDeleteMaintenanceLog();
  const deleteVisitMutation = useDeleteServiceEvent();
  const units = useUnits();

  const [activeTab, setActiveTab] = useState<"dashboard" | "statistics" | "calendar">("dashboard");
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const historySectionRef = useRef<HTMLDivElement>(null);

  const isLoading = isLoadingLogs || isLoadingSummaries || isLoadingVisits;

  const vehicleStats = useMemo<VehicleStatsData | null>(() => {
    if (!vehicle || !allLogs) return null;
    const latestLog = allLogs.length > 0 ? allLogs[0] : null;
    return {
      currentMileage: vehicle.current_mileage ?? 0,
      lastServiceDate: latestLog?.date ?? null,
      daysSinceLastSvc: latestLog
        ? daysBetweenISO(latestLog.date, todayISO())
        : null,
      totalLogs: allLogs.length,
      totalCostCents: allLogs.reduce((sum, log) => sum + log.cost_cents, 0),
      averageCostCentsPerService:
        allLogs.length > 0 ? Math.round(allLogs.reduce((sum, log) => sum + log.cost_cents, 0) / allLogs.length) : 0,
      vehicleAge: vehicle.year ? new Date().getFullYear() - vehicle.year : null,
    };
  }, [vehicle, allLogs]);

  // Cost this year
  const thisYear = new Date().getFullYear();
  const costYTD = useMemo(
    () =>
      allLogs
        .filter((l) => parseISO(l.date)?.y === thisYear)
        .reduce((sum, l) => sum + l.cost_cents, 0),
    [allLogs, thisYear]
  );

  // Overdue services, from the shared due-date engine
  const upcomingItems = useUpcomingMaintenance({
    vehicle,
    serviceTypeSummaries,
    allServiceTypes,
    distanceUnit: units.unit,
  });
  const overdueCount = upcomingItems.filter((item) => item.status === "Overdue").length;
  const dueSoonCount = upcomingItems.filter((item) => item.status === "Upcoming").length;
  const dueItems = upcomingItems.filter((item) => item.status === "Overdue" || item.status === "Upcoming");

  const handleDeleteLog = async (logId: string) => {
    if (!vehicleId) return;
    await deleteLogMutation.mutateAsync({ logId, vehicleId });
  };

  const handleDeleteVisit = async (visitId: string) => {
    if (!vehicleId) return;
    await deleteVisitMutation.mutateAsync({ visitId, vehicleId });
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-24 rounded-lg" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* View Switcher Controls */}
      <div className="flex items-center justify-between pb-1">
        <SegmentedControl
          label="View mode"
          options={[
            { value: "dashboard", label: "Overview" },
            { value: "statistics", label: "Costs" },
            { value: "calendar", label: "Activity" },
          ]}
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as "dashboard" | "statistics" | "calendar")}
        />
        <div className="hidden sm:block text-xs font-mono text-muted-foreground">
          {vehicle.vin ? `VIN ${vehicle.vin}` : "No VIN recorded"}
        </div>
      </div>

      {/* DASHBOARD OVERVIEW */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          {/* The outline: which part of the vehicle is due, tap a part for its services */}
          <VehiclePartsPanel vehicle={vehicle} />

          {/* Telemetry Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Odometer */}
            <div className="kpi-card">
              <div className="flex items-center justify-between -my-1">
                <span className="text-xs font-medium text-muted-foreground">
                  Odometer
                </span>
                <UpdateOdometerPopover vehicleId={vehicle.id} currentMileage={vehicle.current_mileage} />
              </div>
              <div className="mt-2">
                <div className="font-mono text-xl font-medium text-foreground tracking-tight">
                  {units.toDisplay(vehicleStats?.currentMileage ?? 0).toLocaleString()}
                  <span className="text-xs font-normal text-muted-foreground ml-1">{units.unit}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Started at {units.distance(vehicle.initial_mileage ?? 0)}
                </p>
              </div>
            </div>

            {/* Total Maintenance */}
            <div className="kpi-card">
              <span className="text-xs font-medium text-muted-foreground">
                Total spent
              </span>
              <div className="mt-2">
                <div className="font-mono text-xl font-medium text-foreground tracking-tight">
                  {units.money(vehicleStats?.totalCostCents ?? 0)}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                  {units.money(costYTD)} this year
                </p>
              </div>
            </div>

            {/* Service Cadence */}
            <div className="kpi-card">
              <span className="text-xs font-medium text-muted-foreground">
                Last service
              </span>
              <div className="mt-2">
                <div className="font-mono text-base font-medium text-foreground truncate">
                  {vehicleStats?.daysSinceLastSvc != null
                    ? `${vehicleStats.daysSinceLastSvc} days ago`
                    : "No records"}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5 font-mono truncate">
                  {vehicleStats?.lastServiceDate ? formatISO(vehicleStats.lastServiceDate) : "No services logged yet"}
                </p>
              </div>
            </div>

            {/* Status: the same summary line and dot as the phone */}
            <div className="kpi-card">
              <span className="text-xs font-medium text-muted-foreground">Status</span>
              <div className="mt-2">
                {isLoading || isLoadingTypes ? (
                  <Skeleton className="h-5 w-32" />
                ) : (
                  <div className="flex items-center gap-2">
                    <span className={`status-dot ${overdueCount > 0 ? "bg-destructive" : dueSoonCount > 0 ? "bg-warn" : "bg-ok"}`} />
                    <span className="text-sm font-medium text-foreground">{summariseStatuses(upcomingItems)}</span>
                  </div>
                )}
                <p className="text-xs text-muted-foreground mt-1.5">
                  {serviceTypeSummaries.length} service types logged
                </p>
              </div>
            </div>
          </div>

          {/* What is due comes first: it is why the app exists */}
          {dueItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-border">
                <h2 className="text-sm font-medium text-foreground">Due</h2>
                <span className="text-xs font-mono text-muted-foreground">{dueItems.length} items</span>
              </div>
              <ul className="divide-y divide-border rounded-lg border border-border bg-card">
                {dueItems.map((item) => (
                  <li key={item.serviceTypeId} className="flex items-center gap-3 px-4 py-3">
                    <span className={`status-dot ${item.status === "Overdue" ? "bg-destructive" : "bg-warn"}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{item.serviceTypeName}</p>
                      <p className="text-xs text-muted-foreground">{item.message}</p>
                    </div>
                    <span className={item.status === "Overdue" ? "status-overdue" : "status-upcoming"}>
                      {STATUS_LABEL[item.status]}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8 px-3 text-xs"
                      onClick={() => navigate(`/vehicles/${vehicle.id}/add-log?service_type_id=${encodeURIComponent(item.serviceTypeId)}`)}
                    >
                      Log this service
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Service Intervals Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h2 className="text-sm font-medium text-foreground">Service types</h2>
              <span className="text-xs font-mono text-muted-foreground">
                {serviceTypeSummaries.length} items
              </span>
            </div>

            {serviceTypeSummaries.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                No service logs recorded yet. Add your first log to begin category tracking.
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {serviceTypeSummaries.map((summary) => (
                  <div
                    key={summary.service_type_id}
                    onClick={() => navigate(`/vehicles/${vehicle.id}/history/${summary.service_type_id}`)}
                    role="button"
                    tabIndex={0}
                    className="rounded-lg border border-border bg-card p-3.5 hover:border-foreground/20 hover:bg-accent/20 cursor-pointer transition-colors focus-visible:ring-1 focus-visible:ring-foreground focus-visible:outline-none flex flex-col justify-between"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-xs font-medium text-foreground truncate">
                          {summary.service_type_name}
                        </span>
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-secondary text-muted-foreground flex-shrink-0">
                          {summary.log_count} {summary.log_count === 1 ? "log" : "logs"}
                        </span>
                      </div>

                      <div className="mt-3 text-xs text-muted-foreground space-y-1">
                        {summary.last_log_date ? (
                          <>
                            <div className="flex items-center justify-between font-mono">
                              <span>Last:</span>
                              <span className="text-foreground">{formatISO(summary.last_log_date)}</span>
                            </div>
                            <div className="flex items-center justify-between font-mono">
                              <span>Mileage:</span>
                              <span className="text-foreground">{summary.last_log_mileage != null ? units.distance(summary.last_log_mileage) : "—"}</span>
                            </div>
                          </>
                        ) : (
                          <div className="text-muted-foreground/60">No entries logged</div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/40 text-xs text-muted-foreground">
                      <span>History</span>
                      <ChevronRight className="h-3 w-3 opacity-60" />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent History Table */}
          <div ref={historySectionRef} className="space-y-3 pt-2">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h2 className="text-sm font-medium text-foreground">History</h2>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2.5 gap-1"
                onClick={() => navigate(`/vehicles/${vehicle.id}/add-log`)}
              >
                <Plus className="h-3 w-3" />
                Add visit
              </Button>
            </div>

            <LogHistoryList
              visits={visits}
              vehicleName={`${vehicle.make} ${vehicle.model}`}
              isLoading={isLoading}
              onDeleteLog={handleDeleteLog}
              onDeleteVisit={handleDeleteVisit}
              vehicleId={String(vehicle.id)}
              externalDateFilter={dateFilter}
              onClearExternalDateFilter={() => setDateFilter(null)}
            />
          </div>
        </div>
      )}

      {/* STATISTICS TAB */}
      {activeTab === "statistics" && vehicleStats && (
        <VehicleStatistics
          vehicle={vehicle}
          vehicleStats={vehicleStats}
          serviceTypeSummaries={serviceTypeSummaries}
          allServiceTypes={allServiceTypes}
          allLogs={allLogs}
        />
      )}

      {/* CALENDAR / ACTIVITY TAB */}
      {activeTab === "calendar" && (
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-card p-4">
            <ActivityTimeline visits={visits} onSelectDate={(date) => setDateFilter(date)} />
          </div>
        </div>
      )}
    </div>
  );
}
