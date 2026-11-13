import { useParams, useNavigate, Link } from "react-router-dom";
import { useVehicle, useServiceType, useLogsForServiceType, useDeleteMaintenanceLog } from "../api";
import { LogCard } from "../components/LogCard";

// UI Components
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft, Plus } from "lucide-react";

export function ServiceTypeLogHistoryPage() {
  const { vehicleId, serviceTypeId } = useParams<{ vehicleId: string; serviceTypeId: string }>();
  const navigate = useNavigate();

  const { data: vehicle, isLoading: isLoadingVehicle, isError: isVehicleError, error: vehicleError } = useVehicle(vehicleId);
  const {
    data: serviceType,
    isLoading: isLoadingServiceType,
    isError: isServiceTypeError,
    error: serviceTypeError,
  } = useServiceType(serviceTypeId);
  const {
    data: logs = [],
    isLoading: isLoadingLogs,
    isError: isLogsError,
    error: logsError,
  } = useLogsForServiceType(vehicleId, serviceTypeId);
  const deleteLogMutation = useDeleteMaintenanceLog();

  const isLoading = isLoadingVehicle || isLoadingServiceType || isLoadingLogs;
  const isError = isVehicleError || isServiceTypeError || isLogsError;
  const error = vehicleError || serviceTypeError || logsError;

  const handleDeleteLog = async (logId: string) => {
    if (!vehicleId) return;
    await deleteLogMutation.mutateAsync({ logId, vehicleId });
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !vehicle || !serviceType) {
    return (
      <div className="max-w-4xl space-y-4">
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive">
          {(error as Error | null)?.message || "Could not load the requested history."}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Contextual Header */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground pb-4 border-b border-border">
        <Link to={`/vehicles/${vehicle.id}`} className="hover:text-foreground transition-colors flex items-center gap-1">
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>{vehicle.make} {vehicle.model}</span>
        </Link>
        <span className="opacity-40">/</span>
        <span className="font-medium text-foreground">{serviceType.name} History</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium tracking-tight text-foreground">
            {serviceType.name} Log History
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {logs.length} record{logs.length !== 1 ? "s" : ""} on file for this service item.
          </p>
        </div>
        <Button
          size="sm"
          className="h-8 px-3 text-xs gap-1.5 self-start sm:self-auto"
          onClick={() => navigate(`/vehicles/${vehicle.id}/add-log?service_type_id=${serviceTypeId}`)}
        >
          <Plus className="h-3.5 w-3.5" />
          Log This Service
        </Button>
      </div>

      {logs.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
          No records logged for {serviceType.name} yet.
        </div>
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <LogCard key={log.id} log={log} onDelete={handleDeleteLog} />
          ))}
        </div>
      )}
    </div>
  );
}
