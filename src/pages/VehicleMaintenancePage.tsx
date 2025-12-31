import { useState, useMemo, useRef } from "react";
import { useParams, useNavigate, useOutletContext } from "react-router-dom";
import { VehicleDetailContext } from "./VehicleDetailPage"; // Import the context type
import { useAllLogsForVehicle, useServiceTypeSummaries, useServiceTypes, useDeleteMaintenanceLog } from "../api";
import { MaintenanceHeatmap } from "../components/MaintenanceHeatmap";
import { LogHistoryList } from "../components/LogHistoryList";
import { VehicleStatistics, VehicleStatsData } from "../components/VehicleStatistics";

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

// Icons
import { CalendarDays, Gauge, ChevronRight, BarChart3, TrendingUp, CalendarClock } from "lucide-react";

export function VehicleMaintenancePage() {
  const { vehicle } = useOutletContext<VehicleDetailContext>();
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const navigate = useNavigate();

  // --- React Query Hooks ---
  // const { data: vehicle, isLoading: isLoadingVehicle, isError, error } = useVehicle(vehicleId);
  const { data: allLogs = [], isLoading: isLoadingLogs } = useAllLogsForVehicle(vehicleId);
  const { data: serviceTypeSummaries = [], isLoading: isLoadingSummaries } = useServiceTypeSummaries(vehicleId);
  const { data: allServiceTypes = [] } = useServiceTypes(); // Fetches globally, good for stats
  const deleteLogMutation = useDeleteMaintenanceLog();

  const [currentView, setCurrentView] = useState<"overview" | "statistics" | "heatmap">("overview");
  const [dateFilter, setDateFilter] = useState<string | null>(null);
  const historySectionRef = useRef<HTMLDivElement>(null);

  const isLoading = isLoadingLogs || isLoadingSummaries;

  const vehicleStats = useMemo<VehicleStatsData | null>(() => {
    if (!vehicle || !allLogs) return null;
    const latestLog = allLogs.length > 0 ? allLogs[0] : null;
    return {
      currentMileage: latestLog?.mileage ?? vehicle.initial_mileage ?? 0,
      lastServiceDate: latestLog?.date ?? null,
      daysSinceLastSvc: latestLog ? Math.floor((new Date().getTime() - new Date(latestLog.date).getTime()) / 86400000) : null,
      totalLogs: allLogs.length,
      totalCost: allLogs.reduce((sum, log) => sum + log.cost, 0),
      averageCostPerService: allLogs.length > 0 ? allLogs.reduce((sum, log) => sum + log.cost, 0) / allLogs.length : 0,
      vehicleAge: vehicle.year ? new Date().getFullYear() - vehicle.year : null,
    };
  }, [vehicle, allLogs]);

  const handleHeatmapDayClick = (date: string) => {
    setDateFilter(date);
    setTimeout(() => historySectionRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
  };

  const handleDeleteLog = (logId: number) => {
    if (!vehicleId) return;
    deleteLogMutation.mutate({ logId, vehicleId });
  };

  if (isLoading) {
    return (
      <div className="space-y-6 animate-pulse">
        <Skeleton className="h-10 w-full" /> {/* Tabs */}
        <Skeleton className="h-8 w-1/3 mb-4" /> {/* Section Title */}
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  // --- Main Content ---
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-8">
      <div className="flex justify-center gap-2 mb-4 border-b pb-4">
        <Button variant={currentView === "overview" ? "default" : "ghost"} onClick={() => setCurrentView("overview")}>
          <BarChart3 className="mr-2 h-4 w-4" /> Overview
        </Button>
        <Button variant={currentView === "statistics" ? "default" : "ghost"} onClick={() => setCurrentView("statistics")}>
          <TrendingUp className="mr-2 h-4 w-4" /> Statistics
        </Button>
        <Button variant={currentView === "heatmap" ? "default" : "ghost"} onClick={() => setCurrentView("heatmap")}>
          <CalendarClock className="mr-2 h-4 w-4" /> Activity Calendar
        </Button>
      </div>

      {/* Section 1: Service Type Summaries */}
      {currentView === "overview" && (
        <section>
          <h2 className="text-2xl font-semibold mb-4">Service Overview</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {serviceTypeSummaries.map((summary) => (
              <Card
                key={summary.service_type_id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => navigate(`history/${summary.service_type_id}`)}
              >
                <CardHeader>
                  <CardTitle className="flex justify-between">
                    {summary.service_type_name} <Badge variant="secondary">{summary.log_count}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground space-y-1">
                  {summary.last_log_date ? (
                    <>
                      <p className="flex items-center">
                        <CalendarDays className="mr-2 h-4 w-4" />
                        Last: {new Date(summary.last_log_date).toLocaleDateString()}
                      </p>
                      <p className="flex items-center">
                        <Gauge className="mr-2 h-4 w-4" />
                        At: {summary.last_log_mileage?.toLocaleString()} km
                      </p>
                    </>
                  ) : (
                    <p>No entries recorded.</p>
                  )}
                </CardContent>
                <CardFooter>
                  <Button variant="outline" size="sm" className="w-full">
                    View History <ChevronRight className="ml-2 h-4 w-4" />
                  </Button>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>
      )}

      {currentView === "statistics" && vehicleStats && (
        <VehicleStatistics
          vehicle={vehicle}
          vehicleStats={vehicleStats}
          serviceTypeSummaries={serviceTypeSummaries}
          allServiceTypes={allServiceTypes}
        />
      )}

      {currentView === "heatmap" && <MaintenanceHeatmap logs={allLogs} onDayClick={handleHeatmapDayClick} />}

      <Separator />

      <div ref={historySectionRef} className="scroll-mt-20">
        <LogHistoryList
          allLogs={allLogs}
          isLoading={isLoadingLogs}
          onDeleteLog={handleDeleteLog}
          vehicleId={vehicleId!}
          externalDateFilter={dateFilter}
          onClearExternalDateFilter={() => setDateFilter(null)}
        />
      </div>
    </div>
  );
}
