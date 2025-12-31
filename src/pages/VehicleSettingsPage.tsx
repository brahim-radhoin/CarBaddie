import { useParams, useOutletContext } from "react-router-dom"; // Import Navigate
import { VehicleDetailContext } from "./VehicleDetailPage";
import { useUpdateVehicle, useVehicles, useServiceTypes } from "../api";
import { VehicleUpdate } from "../types";
import { toast } from "sonner";
import { AxiosError } from "axios";

// Import your child components
import { VehicleForm } from "@/components/VehicleForm";
import { VehicleServiceIntervalsManager } from "@/components/VehicleServiceIntervalsManager";
import { DeleteVehicleSection } from "@/components/DeleteVehicleSection";
import { DataManagementSection } from "@/components/DataManagementSection";

// UI Components & Icons
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardHeader, CardContent, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Settings } from "lucide-react";

export function VehicleSettingsPage() {
  const { vehicle } = useOutletContext<VehicleDetailContext>();
  const { vehicleId } = useParams<{ vehicleId: string }>();

  // --- React Query Hooks ---
  // const { data: vehicle, isLoading: isLoadingVehicle, isError: isVehicleError } = useVehicle(vehicleId);
  const { data: allServiceTypes, isLoading: isLoadingServiceTypes } = useServiceTypes();
  const { data: allVehicles, isLoading: isLoadingAllVehicles } = useVehicles();
  const { mutate: updateVehicle, isPending: isUpdating, error: updateError } = useUpdateVehicle();

  const isPageLoading = isLoadingServiceTypes || isLoadingAllVehicles;

  const handleSubmit = (payload: VehicleUpdate) => {
    if (!vehicleId) return;
    const hasChanges = (Object.keys(payload) as Array<keyof VehicleUpdate>).some((key) => payload[key] !== vehicle[key]);
    if (!hasChanges) {
      toast.info("No changes were made.");
      return;
    }
    updateVehicle({ id: Number(vehicleId), vehicleData: payload });
  };

  const getBackendErrors = () => {
    const axiosError = updateError as AxiosError<{ detail: any[] }>;
    const errors: Record<string, string[]> = {};
    if (axiosError?.response?.status === 422 && Array.isArray(axiosError.response.data.detail)) {
      axiosError.response.data.detail.forEach((err) => {
        const fieldKey = String(err.loc[1]) || "general";
        if (!errors[fieldKey]) errors[fieldKey] = [];
        errors[fieldKey].push(err.msg);
      });
    }
    return errors;
  };

  // --- Render Logic ---

  // Show a full-page skeleton while waiting for any initial data
  if (isPageLoading) {
    return (
      <div className="p-4 md:p-6 max-w-4xl mx-auto animate-pulse space-y-6">
        <Skeleton className="h-7 w-1/2 mb-4" />
        <Skeleton className="h-10 w-1/3 mb-2" />
        <Skeleton className="h-10 w-full mb-6" />
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-1/4" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-40 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  // If we reach this point, all data is loaded and valid.
  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-2">
        <Settings className="h-8 w-8 text-primary" />
        <h1 className="text-3xl font-bold tracking-tight">Vehicle Settings</h1>
      </div>

      <Tabs defaultValue="details" className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-4">
          <TabsTrigger value="details">Edit Details</TabsTrigger>
          <TabsTrigger value="intervals">Service Intervals</TabsTrigger>
          <TabsTrigger value="backup">Data Management</TabsTrigger>
          <TabsTrigger value="danger">Danger Zone</TabsTrigger>
        </TabsList>

        <TabsContent value="details">
          <Card className="pb-0">
            <CardHeader>
              <CardTitle>Vehicle Information</CardTitle>
              <CardDescription>Update the core details of your vehicle.</CardDescription>
            </CardHeader>
            <VehicleForm
              initialData={vehicle}
              onSubmit={handleSubmit}
              isSubmitting={isUpdating}
              backendErrors={getBackendErrors()}
              mode="edit"
            />
          </Card>
        </TabsContent>

        <TabsContent value="intervals">
          <VehicleServiceIntervalsManager
            vehicleId={vehicle.id}
            allServiceTypes={allServiceTypes || []}
            currentOverrides={vehicle.interval_overrides}
            isLoading={isLoadingServiceTypes}
          />
        </TabsContent>

        <TabsContent value="backup">
          <DataManagementSection allVehicles={allVehicles || []} />
        </TabsContent>

        <TabsContent value="danger">
          <DeleteVehicleSection vehicleId={vehicle.id} vehicleName={`${vehicle.make} ${vehicle.model}`} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
