import { useParams, useOutletContext, Link } from "react-router-dom";
import { VehicleDetailContext } from "./VehicleDetailPage";
import { useUpdateVehicle, useVehicles, useServiceTypes } from "../api";
import { VehicleUpdate } from "../types";
import { toast } from "sonner";
import { ValidationError } from "@carbaddie/core";

// Import child components
import { VehicleForm } from "@/components/VehicleForm";
import { VehicleServiceIntervalsManager } from "@/components/VehicleServiceIntervalsManager";
import { DeleteVehicleSection } from "@/components/DeleteVehicleSection";
import { DataManagementSection } from "@/components/DataManagementSection";

// UI Components & Icons
import { Tabs } from "@/components/interior/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft } from "lucide-react";

export function VehicleSettingsPage() {
  const { vehicle } = useOutletContext<VehicleDetailContext>();
  const { vehicleId } = useParams<{ vehicleId: string }>();

  const { data: allServiceTypes, isLoading: isLoadingServiceTypes } = useServiceTypes();
  const { data: allVehicles, isLoading: isLoadingAllVehicles } = useVehicles();
  const { mutate: updateVehicle, isPending: isUpdating, error: updateError } = useUpdateVehicle();

  const isPageLoading = isLoadingServiceTypes || isLoadingAllVehicles;

  const handleSubmit = (payload: VehicleUpdate) => {
    if (!vehicleId) return;
    const hasChanges = (Object.keys(payload) as Array<keyof VehicleUpdate>).some(
      (key) => payload[key] !== vehicle[key]
    );
    if (!hasChanges) {
      toast.info("No changes were made.");
      return;
    }
    updateVehicle({ id: vehicleId!, vehicleData: payload });
  };

  // Field errors from the repository's input checks (@carbaddie/core validation.ts).
  const getBackendErrors = (): Record<string, string[]> =>
    updateError instanceof ValidationError ? updateError.fieldErrors : {};

  if (isPageLoading) {
    return (
      <div className="max-w-4xl space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-64 w-full" />
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
        <span className="font-medium text-foreground">Settings</span>
      </div>

      <div>
        <h1 className="text-xl font-medium tracking-tight text-foreground">
          Vehicle Settings & Overrides
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage interval calibrations, backup exports, and vehicle records.
        </p>
      </div>

      <Tabs
        defaultValue="details"
        className="w-full"
        items={[
          { value: "details", label: "Specifications" },
          { value: "intervals", label: "Service Overrides" },
          { value: "backup", label: "Data Management" },
          { value: "danger", label: "Danger Zone" },
        ]}
        renderPanel={(value) => {
          switch (value) {
            case "details":
              return (
                <div className="pt-4">
                  <VehicleForm
                    initialData={vehicle}
                    onSubmit={handleSubmit}
                    isSubmitting={isUpdating}
                    backendErrors={getBackendErrors()}
                    mode="edit"
                  />
                </div>
              );
            case "intervals":
              return (
                <div className="pt-4">
                  <VehicleServiceIntervalsManager
                    vehicleId={vehicle.id}
                    allServiceTypes={allServiceTypes || []}
                    currentOverrides={vehicle.interval_overrides}
                    isLoading={isLoadingServiceTypes}
                  />
                </div>
              );
            case "backup":
              return (
                <div className="pt-4">
                  <DataManagementSection allVehicles={allVehicles || []} />
                </div>
              );
            case "danger":
              return (
                <div className="pt-4">
                  <DeleteVehicleSection vehicleId={vehicle.id} vehicleName={`${vehicle.make} ${vehicle.model}`} />
                </div>
              );
            default:
              return null;
          }
        }}
      />
    </div>
  );
}
