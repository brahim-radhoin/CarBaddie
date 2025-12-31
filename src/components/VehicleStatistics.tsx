import { useMemo } from "react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { ServiceTypeLogSummary, ServiceTypeRead, UpcomingMaintenanceItemData, VehicleRead as Vehicle } from "../types";
import { useUpcomingMaintenance } from "../hooks/useUpcomingMaintenance"; // Adjust path if needed
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  Gauge,
  DollarSign,
  Sigma,
  Wrench,
  Hash,
  Milestone,
  TrendingUp,
  CalendarDays,
  AlertCircle,
  Clock,
  CheckCircle,
  Info,
  BarChart3,
} from "lucide-react";
import { formatCurrency, formatDate, getReadableDate, VehicleStatsData, CostChartData } from "@/lib/utils"; // Adjust path if needed

// ====================================================================
// PROPS INTERFACE
// ====================================================================

interface VehicleStatisticsProps {
  vehicle: Vehicle | null;
  vehicleStats: VehicleStatsData | null;
  serviceTypeSummaries: ServiceTypeLogSummary[];
  allServiceTypes: ServiceTypeRead[];
}

// ====================================================================
// Custom Tooltip Component
// ====================================================================

const CustomChartTooltip: React.FC<any> = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    return (
      <Card className="text-sm shadow-lg">
        <CardContent className="p-2">
          <p className="font-semibold mb-1">{label || data.name}</p>
          <p className="text-primary font-bold">{formatCurrency(payload[0].value)}</p>
        </CardContent>
      </Card>
    );
  }
  return null;
};

// ====================================================================
// SUB-COMPONENTS
// ====================================================================

interface StatCardProps {
  title: string;
  value: string | number;
  description?: string | React.ReactNode;
  icon: React.ElementType;
  unit?: string;
}

const StatCard: React.FC<StatCardProps> = ({ title, value, description, icon: Icon, unit }) => (
  <Card className="flex flex-col">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium">{title}</CardTitle>
      <Icon className="h-4 w-4 text-muted-foreground" />
    </CardHeader>
    <CardContent className="flex-grow">
      <div className="text-2xl font-bold">
        {value}
        {unit && <span className="text-sm font-normal text-muted-foreground ml-1">{unit}</span>}
      </div>
      {description && <p className="text-xs text-muted-foreground">{description}</p>}
    </CardContent>
  </Card>
);

const MainStatsGrid: React.FC<{ vehicleStats: VehicleStatsData; vehicle: Vehicle }> = ({ vehicleStats, vehicle }) => {
  const costStats = useMemo(() => {
    const totalDistance =
      vehicleStats.currentMileage !== "N/A" && typeof vehicle.initial_mileage === "number"
        ? (vehicleStats.currentMileage as number) - vehicle.initial_mileage
        : null;
    const costPerKm = totalDistance && totalDistance > 0 ? vehicleStats.totalCost / totalDistance : null;
    const acquisitionDate = vehicle.acquisition_date ? new Date(vehicle.acquisition_date) : null;
    const yearsOwned = acquisitionDate ? (new Date().getTime() - acquisitionDate.getTime()) / (1000 * 365.25 * 24 * 60 * 60) : null;
    const costPerYear = yearsOwned && yearsOwned > 0 ? vehicleStats.totalCost / yearsOwned : null;
    return { costPerKm, costPerYear };
  }, [vehicleStats, vehicle]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      <StatCard
        title="Current Mileage"
        value={vehicleStats.currentMileage === "N/A" ? "N/A" : vehicleStats.currentMileage.toLocaleString()}
        unit={vehicleStats.currentMileage !== "N/A" ? "km" : undefined}
        icon={Gauge}
        description={
          <>
            <CalendarDays className="inline h-3 w-3 mr-1" />
            Updated: {formatDate(vehicleStats.lastServiceDate)}
          </>
        }
      />
      <StatCard
        title="Total Maintenance Cost"
        value={formatCurrency(vehicleStats.totalCost)}
        icon={DollarSign}
        description={`Across ${vehicleStats.totalLogs} log${vehicleStats.totalLogs !== 1 ? "s" : ""}`}
      />
      <StatCard
        title="Avg. Cost Per Service"
        value={formatCurrency(vehicleStats.averageCostPerService)}
        icon={Sigma}
        description={vehicleStats.totalLogs > 0 ? `Based on ${vehicleStats.totalLogs} services` : "No services logged"}
      />
      <StatCard
        title="Last Serviced"
        value={vehicleStats.daysSinceLastSvc !== null ? `${vehicleStats.daysSinceLastSvc}` : "N/A"}
        unit={vehicleStats.daysSinceLastSvc !== null ? "days ago" : undefined}
        icon={Wrench}
        description={
          <>
            <CalendarDays className="inline h-3 w-3 mr-1" />
            On: {formatDate(vehicleStats.lastServiceDate)}
          </>
        }
      />
      {costStats?.costPerKm !== null && (
        <StatCard
          title="Avg. Cost per Km"
          value={formatCurrency(costStats.costPerKm)}
          icon={DollarSign}
          description="Total cost / total distance"
        />
      )}
      {costStats?.costPerYear !== null && (
        <StatCard
          title="Avg. Cost per Year"
          value={formatCurrency(costStats.costPerYear)}
          icon={CalendarDays}
          description="Total cost / years owned"
        />
      )}
      <StatCard title="Total Logs Recorded" value={vehicleStats.totalLogs} icon={Hash} description="Total maintenance entries" />
      {vehicleStats.vehicleAge !== null && (
        <StatCard
          title="Vehicle Age"
          value={vehicleStats.vehicleAge}
          unit={`year${vehicleStats.vehicleAge !== 1 ? "s" : ""} old`}
          icon={Milestone}
          description={vehicle.year ? `Based on model year ${vehicle.year}` : ""}
        />
      )}
    </div>
  );
};

const CostBreakdownChart: React.FC<{ summaries: ServiceTypeLogSummary[] }> = ({ summaries }) => {
  const chartData = useMemo((): CostChartData[] => {
    if (!summaries || summaries.length === 0) return [];
    return summaries
      .filter((s) => s.total_cost_for_service_type > 0)
      .map((s) => ({ name: s.service_type_name, cost: s.total_cost_for_service_type }))
      .sort((a, b) => b.cost - a.cost);
  }, [summaries]);

  if (chartData.length === 0) return null;

  const barCategoryGap = chartData.length < 4 ? "35%" : "20%";

  return (
    <section id="cost-breakdown-section" className="space-y-4 pt-6">
      <div className="flex items-center gap-2">
        <BarChart3 className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-semibold tracking-tight">Cost Breakdown by Service Type</h2>
      </div>
      <Card>
        <CardContent className="pt-6">
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={chartData} margin={{ top: 5, right: 20, left: 10, bottom: 50 }} barCategoryGap={barCategoryGap}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} angle={-35} textAnchor="end" height={60} interval={0} />
              <YAxis tickFormatter={(value) => `${formatCurrency(value)}`} tick={{ fontSize: 12 }} />
              <Tooltip
                // cursor={{  radius: 4 }}
                content={<CustomChartTooltip />}
                // Add these properties to control animation and positioning:
                animationEasing="ease-out"
                wrapperStyle={{ outline: "none" }} // Prevents default browser focus outline on the wrapper
              />
              <Legend verticalAlign="top" wrapperStyle={{ paddingBottom: "20px" }} />
              <Bar dataKey="cost" fill="hsl(var(--primary))" name="Total Cost" radius={[4, 4, 0, 0]} maxBarSize={80} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </section>
  );
};

const UpcomingMaintenanceCard: React.FC<{ item: UpcomingMaintenanceItemData }> = ({ item }) => {
  const getStatusBadgeVariant = (
    status: UpcomingMaintenanceItemData["status"]
  ): "destructive" | "warning" | "success" | "default" | "secondary" => {
    switch (status) {
      case "Overdue":
        return "destructive";
      case "Upcoming":
        return "warning";
      case "OK":
        return "success";
      case "NeverDone":
        return "secondary";
      default:
        return "default";
    }
  };
  const getStatusIcon = (status: UpcomingMaintenanceItemData["status"]): React.ElementType => {
    switch (status) {
      case "Overdue":
        return AlertCircle;
      case "Upcoming":
        return Clock;
      case "OK":
        return CheckCircle;
      default:
        return Info;
    }
  };
  const StatusIcon = getStatusIcon(item.status);

  return (
    <Card className="p-4">
      <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
        <h3 className="text-lg font-semibold text-foreground flex items-center">
          <StatusIcon
            className={`mr-2 h-5 w-5 text-${
              getStatusBadgeVariant(item.status) === "destructive"
                ? "destructive"
                : getStatusBadgeVariant(item.status) === "warning"
                ? "yellow-500"
                : getStatusBadgeVariant(item.status) === "success"
                ? "green-500"
                : "muted-foreground"
            }`}
          />
          {item.serviceTypeName}
        </h3>
        <Badge variant={getStatusBadgeVariant(item.status)} className="self-start sm:self-center">
          {item.status.replace(/([A-Z])/g, " $1").trim()}
        </Badge>
      </div>
      <p className="text-sm text-muted-foreground mt-1 ml-7 sm:ml-0 sm:mt-1">{item.message}</p>
      {item.details && (
        <div className="mt-2 ml-7 sm:ml-0 text-xs text-muted-foreground space-y-0.5">
          {item.details.lastPerformed && (item.details.lastPerformed.date || item.details.lastPerformed.mileage != null) && (
            <p>
              Last: {getReadableDate(item.details.lastPerformed.date)}
              {item.details.lastPerformed.mileage != null && ` at ${item.details.lastPerformed.mileage.toLocaleString()} km`}
            </p>
          )}
          {item.details.byDate && (
            <p>
              Due by Date: {item.details.byDate.due} (
              {item.details.byDate.remainingDays > 0
                ? `${item.details.byDate.remainingDays} days left`
                : `${Math.abs(item.details.byDate.remainingDays)} days ago`}
              )
            </p>
          )}
          {item.details.byMileage && (
            <p>
              Due by Mileage: {item.details.byMileage.due.toLocaleString()} km (
              {item.details.byMileage.remainingKm > 0
                ? `${item.details.byMileage.remainingKm.toLocaleString()} km left`
                : `${Math.abs(item.details.byMileage.remainingKm).toLocaleString()} km ago`}
              )
            </p>
          )}
        </div>
      )}
    </Card>
  );
};

const UpcomingMaintenanceList: React.FC<{ items: UpcomingMaintenanceItemData[] }> = ({ items }) => (
  <section id="upcoming-maintenance-section" className="space-y-4 pt-6">
    <div className="flex items-center gap-2">
      <Clock className="h-6 w-6 text-primary" />
      <h2 className="text-2xl font-semibold tracking-tight">Upcoming & Overdue Services</h2>
    </div>
    {items.length > 0 ? (
      <div className="space-y-3">
        {items.map((item) => (
          <UpcomingMaintenanceCard key={item.serviceTypeId} item={item} />
        ))}
      </div>
    ) : (
      <p className="text-muted-foreground italic">No services are currently upcoming or overdue.</p>
    )}
  </section>
);

// ====================================================================
// MAIN COMPONENT
// ====================================================================

export function VehicleStatistics({ vehicle, vehicleStats, serviceTypeSummaries, allServiceTypes }: VehicleStatisticsProps) {
  const upcomingMaintenance = useUpcomingMaintenance({
    vehicle,
    vehicleStats,
    serviceTypeSummaries,
    allServiceTypes,
  });

  if (!vehicle || !vehicleStats) {
    return (
      <div className="space-y-12 animate-pulse">
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Skeleton className="h-7 w-7" />
            <Skeleton className="h-8 w-64" />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {[...Array(8)].map((_, i) => (
              <Skeleton key={i} className="h-28 rounded-lg" />
            ))}
          </div>
        </section>
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Skeleton className="h-7 w-7" />
            <Skeleton className="h-8 w-64" />
          </div>
          <Skeleton className="h-80 w-full rounded-lg" />
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-12">
      <section id="statistics-section">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">Vehicle Statistics</h2>
        </div>
        <MainStatsGrid vehicleStats={vehicleStats} vehicle={vehicle} />
      </section>

      <CostBreakdownChart summaries={serviceTypeSummaries} />

      <UpcomingMaintenanceList items={upcomingMaintenance} />
    </div>
  );
}
