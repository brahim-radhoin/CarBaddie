import { useMemo } from "react";
import {
  VehicleRead,
  ServiceTypeLogSummary,
  ServiceTypeRead,
  MaintenanceLogRead,
} from "../types";
import {
  PieChart,
  Pie,
  Cell,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";

import { Gauge, Calendar, DollarSign, Activity } from "lucide-react";
import { useUnits } from "../hooks/useUnits";

export interface VehicleStatsData {
  currentMileage: number;
  lastServiceDate: string | null;
  daysSinceLastSvc: number | null;
  totalLogs: number;
  totalCostCents: number;
  averageCostCentsPerService: number;
  vehicleAge: number | null;
}

interface VehicleStatisticsProps {
  vehicle: VehicleRead;
  vehicleStats: VehicleStatsData;
  serviceTypeSummaries: ServiceTypeLogSummary[];
  allServiceTypes: ServiceTypeRead[];
  allLogs: MaintenanceLogRead[];
}

// Consistent instrumental palette
const CHART_COLORS = [
  "#d97706", // Amber
  "#3b82f6", // Blue
  "#10b981", // Emerald
  "#6b7280", // Slate
  "#9ca3af", // Gray
  "#8b5cf6", // Purple
];

export function VehicleStatistics({
  vehicle,
  vehicleStats,
  serviceTypeSummaries,
  allLogs,
}: VehicleStatisticsProps) {
  const units = useUnits();
  // 1. Cost per km / mile, in cents
  const costPerDistance = useMemo(() => {
    if (allLogs.length === 0 || !vehicle.initial_mileage) return 0;
    const distance = units.toDisplay(vehicleStats.currentMileage - vehicle.initial_mileage);
    return distance > 0 ? Math.round(vehicleStats.totalCostCents / distance) : 0;
  }, [allLogs, vehicle, vehicleStats, units]);

  // 2. Cumulative Spend Timeline
  const spendTimelineData = useMemo(() => {
    if (allLogs.length === 0) return [];
    const sorted = [...allLogs].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let cumulative = 0;
    return sorted.map((log) => {
      cumulative += log.cost_cents;
      return {
        date: log.date,
        cost: log.cost_cents,
        cumulative,
      };
    });
  }, [allLogs]);

  // 3. Category Distribution Data
  const categoryChartData = useMemo(() => {
    return serviceTypeSummaries
      .filter((s) => s.total_cost_cents > 0)
      .map((s) => ({
        name: s.service_type_name,
        value: s.total_cost_cents,
        count: s.log_count,
      }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [serviceTypeSummaries]);

  return (
    <div className="space-y-6">
      {/* KPI Cards Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="kpi-card">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span>Odometer</span>
            <Gauge className="h-3.5 w-3.5 opacity-60" />
          </div>
          <div className="mt-2">
            <div className="font-mono text-xl font-medium text-foreground tracking-tight">
              {units.toDisplay(vehicleStats.currentMileage).toLocaleString()}
              <span className="text-xs font-normal text-muted-foreground ml-1">{units.unit}</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              +{units.distance(Math.max(0, vehicleStats.currentMileage - (vehicle.initial_mileage ?? 0)))} logged
            </p>
          </div>
        </div>

        <div className="kpi-card">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span>Total Maintenance</span>
            <DollarSign className="h-3.5 w-3.5 opacity-60" />
          </div>
          <div className="mt-2">
            <div className="font-mono text-xl font-medium text-foreground tracking-tight">
              {units.money(vehicleStats.totalCostCents)}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
              {units.money(costPerDistance)}/{units.unit}
            </p>
          </div>
        </div>

        <div className="kpi-card">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span>Service History</span>
            <Activity className="h-3.5 w-3.5 opacity-60" />
          </div>
          <div className="mt-2">
            <div className="font-mono text-xl font-medium text-foreground tracking-tight">
              {vehicleStats.totalLogs}
              <span className="text-xs font-normal text-muted-foreground ml-1">records</span>
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5 font-mono">
              avg {units.money(vehicleStats.averageCostCentsPerService)}/svc
            </p>
          </div>
        </div>

        <div className="kpi-card">
          <div className="flex items-center justify-between text-muted-foreground text-xs">
            <span>Last Service</span>
            <Calendar className="h-3.5 w-3.5 opacity-60" />
          </div>
          <div className="mt-2">
            <div className="font-mono text-base font-medium text-foreground truncate mt-1">
              {vehicleStats.lastServiceDate ?? "No logs"}
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {vehicleStats.daysSinceLastSvc !== null
                ? `${vehicleStats.daysSinceLastSvc} days ago`
                : "Awaiting first service"}
            </p>
          </div>
        </div>
      </div>

      {/* Visual Telemetry Charts */}
      {allLogs.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Cumulative Spend Timeline */}
          <div className="rounded-lg border border-border bg-card p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-3 border-b border-border text-xs">
              <span className="font-medium text-foreground">Cumulative Spend Timeline</span>
              <span className="font-mono text-muted-foreground text-[11px]">{spendTimelineData.length} records</span>
            </div>
            <div className="h-56 mt-4 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={spendTimelineData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.15} vertical={false} />
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={{ stroke: "rgba(128,128,128,0.2)" }}
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(val) => units.money(Number(val))}
                  />
                  <RechartsTooltip
                    contentStyle={{
                      backgroundColor: "var(--card)",
                      borderColor: "var(--border)",
                      fontSize: "12px",
                      borderRadius: "6px",
                    }}
                    formatter={(val) => [units.money(Number(val ?? 0)), "Cumulative"]}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulative"
                    stroke="#d97706"
                    strokeWidth={1.5}
                    dot={{ r: 2.5, fill: "#d97706" }}
                    activeDot={{ r: 4 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Cost by Category */}
          <div className="rounded-lg border border-border bg-card p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between pb-3 border-b border-border text-xs">
              <span className="font-medium text-foreground">Expenditure by Category</span>
              <span className="font-mono text-muted-foreground text-[11px]">Top categories</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4 items-center">
              <div className="h-48 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={categoryChartData}
                      cx="50%"
                      cy="50%"
                      innerRadius={45}
                      outerRadius={70}
                      paddingAngle={2}
                      dataKey="value"
                    >
                      {categoryChartData.map((_, index) => (
                        <Cell key={`cell-${index}`} fill={CHART_COLORS[index % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: "var(--card)",
                        borderColor: "var(--border)",
                        fontSize: "12px",
                        borderRadius: "6px",
                      }}
                      formatter={(val) => [units.money(Number(val ?? 0)), "Cost"]}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Legend List */}
              <div className="space-y-1.5 text-xs">
                {categoryChartData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: CHART_COLORS[index % CHART_COLORS.length] }}
                      />
                      <span className="truncate text-muted-foreground text-[11px]">{entry.name}</span>
                    </div>
                    <span className="font-mono text-[11px] font-medium text-foreground ml-2">
                      {units.money(entry.value)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
