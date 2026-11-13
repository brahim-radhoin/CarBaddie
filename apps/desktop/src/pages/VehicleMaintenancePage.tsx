import { useState, useMemo, useRef } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { VehicleDetailContext } from "./VehicleDetailPage";
import { useAllLogsForVehicle, useServiceTypeSummaries, useServiceTypes, useDeleteMaintenanceLog } from "../api";
import { ActivityTimeline } from "../components/ActivityTimeline";
import { LogHistoryList } from "../components/LogHistoryList";
import { VehicleStatistics, VehicleStatsData } from "../components/VehicleStatistics";

// UI Components
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

// Icons
import {
  ChevronRight,
  AlertTriangle,
  Plus,
} from "lucide-react";
import { SegmentedControl } from "@/components/interior/segmented-control";

export function VehicleMaintenancePage() {
  const { vehicle } = useOutletContext<VehicleDetailContext>();
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const navigate = useNavigate();

  const { data: allLogs = [], isLoading: isLoadingLogs } = useAllLogsForVehicle(vehicleId);
  const { data: serviceTypeSummaries = [], isLoading: isLoadingSummaries } = useServiceTypeSummaries(vehicleId);
  const { data: allServiceTypes = [] } = useServiceTypes();
  const deleteLogMutation = useDeleteMaintenanceLog();

  const [activeTab, setActiveTab] = useState<"dashboard" | "statistics" | "calendar">("dashboard");
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const historySectionRef = useRef<HTMLDivElement>(null);

  const isLoading = isLoadingLogs || isLoadingSummaries;

  const vehicleStats = useMemo<VehicleStatsData | null>(() => {
    if (!vehicle || !allLogs) return null;
    const latestLog = allLogs.length > 0 ? allLogs[0] : null;
    return {
      currentMileage: latestLog?.mileage ?? vehicle.initial_mileage ?? 0,
      lastServiceDate: latestLog?.date ?? null,
      daysSinceLastSvc: latestLog
        ? Math.floor((new Date().getTime() - new Date(latestLog.date).getTime()) / 86400000)
        : null,
      totalLogs: allLogs.length,
      totalCost: allLogs.reduce((sum, log) => sum + log.cost, 0),
      averageCostPerService:
        allLogs.length > 0 ? allLogs.reduce((sum, log) => sum + log.cost, 0) / allLogs.length : 0,
      vehicleAge: vehicle.year ? new Date().getFullYear() - vehicle.year : null,
    };
  }, [vehicle, allLogs]);

  // Cost this year
  const thisYear = new Date().getFullYear();
  const costYTD = useMemo(
    () =>
      allLogs
        .filter((l) => new Date(l.date).getFullYear() === thisYear)
        .reduce((sum, l) => sum + l.cost, 0),
    [allLogs, thisYear]
  );

  // Check overdue services
  const overdueCount = serviceTypeSummaries.filter((s) => {
    if (!s.last_log_date) return false;
    const daysSince = Math.floor(
      (Date.now() - new Date(s.last_log_date).getTime()) / 86400000
    );
    return daysSince > 365;
  }).length;

  const handleDeleteLog = async (logId: string) => {
    if (!vehicleId) return;
    await deleteLogMutation.mutateAsync({ logId, vehicleId });
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
            { value: "statistics", label: "Telemetry & Costs" },
            { value: "calendar", label: "Activity Log" },
          ]}
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as "dashboard" | "statistics" | "calendar")}
        />
        <div className="hidden sm:block text-xs font-mono text-muted-foreground">
          {vehicle.vin ? `VIN: ${vehicle.vin}` : "No VIN recorded"}
        </div>
      </div>

      {/* DASHBOARD OVERVIEW */}
      {activeTab === "dashboard" && (
        <div className="space-y-6">
          {/* Telemetry Metric Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {/* Odometer */}
            <div className="kpi-card">
              <span className="text-[11px] font-medium text-muted-foreground">
                Odometer
              </span>
              <div className="mt-2">
                <div className="font-mono text-xl font-medium text-foreground tracking-tight">
                  {vehicleStats?.currentMileage.toLocaleString()}
                  <span className="text-xs font-normal text-muted-foreground ml-1">km</span>
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Initial: {vehicle.initial_mileage?.toLocaleString() ?? 0} km
                </p>
              </div>
            </div>

            {/* Total Maintenance */}
            <div className="kpi-card">
              <span className="text-[11px] font-medium text-muted-foreground">
                Total Maintenance
              </span>
              <div className="mt-2">
                <div className="font-mono text-xl font-medium text-foreground tracking-tight">
                  ${vehicleStats?.totalCost.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
                  ${costYTD.toLocaleString(undefined, { maximumFractionDigits: 0 })} this year
                </p>
              </div>
            </div>

            {/* Service Cadence */}
            <div className="kpi-card">
              <span className="text-[11px] font-medium text-muted-foreground">
                Last Service
              </span>
              <div className="mt-2">
                <div className="font-mono text-base font-medium text-foreground truncate">
                  {vehicleStats?.daysSinceLastSvc != null
                    ? `${vehicleStats.daysSinceLastSvc} days ago`
                    : "No records"}
                </div>
                <p className="text-[11px] text-muted-foreground mt-0.5 font-mono truncate">
                  {vehicleStats?.lastServiceDate ?? "Awaiting first log"}
                </p>
              </div>
            </div>

            {/* Fleet Health */}
            <div className="kpi-card">
              <span className="text-[11px] font-medium text-muted-foreground">
                Fleet Health
              </span>
              <div className="mt-2">
                {overdueCount > 0 ? (
                  <span className="status-overdue">
                    <AlertTriangle className="h-3 w-3" />
                    {overdueCount} Service Overdue
                  </span>
                ) : (
                  <span className="status-ok">
                    All Services Current
                  </span>
                )}
                <p className="text-[11px] text-muted-foreground mt-1.5 font-mono">
                  {serviceTypeSummaries.length} categories tracked
                </p>
              </div>
            </div>
          </div>

          {/* Service Intervals Grid */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h2 className="text-sm font-medium text-foreground">Service Categories</h2>
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
                        <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground flex-shrink-0">
                          {summary.log_count} {summary.log_count === 1 ? "log" : "logs"}
                        </span>
                      </div>

                      <div className="mt-3 text-[11px] text-muted-foreground space-y-1">
                        {summary.last_log_date ? (
                          <>
                            <div className="flex items-center justify-between font-mono">
                              <span>Last:</span>
                              <span className="text-foreground">{summary.last_log_date}</span>
                            </div>
                            <div className="flex items-center justify-between font-mono">
                              <span>Mileage:</span>
                              <span className="text-foreground">{summary.last_log_mileage?.toLocaleString()} km</span>
                            </div>
                          </>
                        ) : (
                          <div className="text-muted-foreground/60 italic">No entries logged</div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-border/40 text-[11px] text-muted-foreground">
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
              <h2 className="text-sm font-medium text-foreground">Maintenance Log History</h2>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2.5 gap-1"
                onClick={() => navigate(`/vehicles/${vehicle.id}/add-log`)}
              >
                <Plus className="h-3 w-3" />
                Add Record
              </Button>
            </div>

            <LogHistoryList
              allLogs={allLogs}
              vehicleName={`${vehicle.make} ${vehicle.model}`}
              isLoading={isLoading}
              onDeleteLog={handleDeleteLog}
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
            <ActivityTimeline logs={allLogs} onSelectDate={(date) => setDateFilter(date)} />
          </div>
        </div>
      )}
    </div>
  );
}
