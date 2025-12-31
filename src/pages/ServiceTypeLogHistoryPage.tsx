import { useParams, useNavigate } from "react-router-dom";
import { useVehicle, useServiceType, useLogsForServiceType } from "../api";
import { LogCard } from "../components/LogCard";
import { AxiosError } from "axios";

// UI Components
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";

// Icons
import { ChevronLeft, ListChecks, Tag, AlertTriangle, PlusCircle } from "lucide-react";

export function ServiceTypeLogHistoryPage() {
  const { vehicleId, serviceTypeId } = useParams<{ vehicleId: string; serviceTypeId: string }>();
  const navigate = useNavigate();

  // --- React Query Hooks for parallel data fetching ---
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

  const isLoading = isLoadingVehicle || isLoadingServiceType || isLoadingLogs;
  const isError = isVehicleError || isServiceTypeError || isLogsError;
  const error = vehicleError || serviceTypeError || logsError;

  // --- Render Logic ---

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6 animate-pulse">
        <Skeleton className="h-8 w-1/2 mb-2" />
        <div className="flex items-center gap-3 mb-1">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-64" />
        </div>
        <Skeleton className="h-4 w-48 mb-6" />
        <Separator />
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-36 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !vehicle || !serviceType) {
    return (
      <div className="p-4 md:p-6 max-w-md mx-auto">
        <Alert variant="destructive" className="mt-10">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>Error Loading Data</AlertTitle>
          <AlertDescription>
            {(error as AxiosError<{ detail: string }>)?.response?.data?.detail || "Could not load the requested history."}
          </AlertDescription>
        </Alert>
        <Button onClick={() => navigate(`/vehicles/${vehicleId}/maintenance`)} variant="outline" className="mt-4 w-full">
          <ChevronLeft className="mr-2 h-4 w-4" /> Back to Maintenance
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <header className="flex flex-col sm:flex-row justify-between items-center gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <Tag className="h-8 w-8 text-primary" />
            <h1 className="text-3xl font-bold tracking-tight">{serviceType.name} History</h1>
          </div>
          <p className="text-sm text-muted-foreground ml-11">
            For {vehicle.make} {vehicle.model}
          </p>
        </div>
        <Button onClick={() => navigate(`/vehicles/${vehicleId}/add-log?service_type_id=${serviceTypeId}`)}>
          <PlusCircle className="mr-2 h-5 w-5" /> Add New {serviceType.name} Log
        </Button>
      </header>

      <Separator />

      <section>
        {logs.length > 0 ? (
          <div className="grid gap-4">
            {logs.map((log) => (
              <LogCard key={log.id} log={log} />
            ))}
          </div>
        ) : (
          <Card className="text-center py-10">
            <CardHeader>
              <ListChecks className="mx-auto h-10 w-10 text-muted-foreground" />
              <CardTitle className="mt-4 text-xl">No Logs Found</CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>No '{serviceType.name}' maintenance has been recorded for this vehicle.</CardDescription>
              <Button onClick={() => navigate(`/vehicles/${vehicleId}/add-log?service_type_id=${serviceTypeId}`)} className="mt-6">
                <PlusCircle className="mr-2 h-4 w-4" /> Add First Log
              </Button>
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
