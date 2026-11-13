import { useParams, useNavigate, Link } from "react-router-dom";
import { useVehicle, useUpdateVehicle } from "../api";
import { VehicleUpdate } from "../types";
import { VehicleForm } from "@/components/VehicleForm";
import { ValidationError } from "@carbaddie/core";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronLeft } from "lucide-react";
import { toast } from "sonner";

export function EditVehiclePage() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const navigate = useNavigate();

  const { data: vehicle, isLoading, isError, error: queryError } = useVehicle(vehicleId);
  const { mutate: updateVehicle, isPending, error: mutationError } = useUpdateVehicle();

  const handleSubmit = (payload: VehicleUpdate) => {
    if (!vehicleId) return;

    const hasChanges = Object.keys(payload).some(
      (key) => payload[key as keyof VehicleUpdate] !== vehicle?.[key as keyof typeof vehicle]
    );
    if (!hasChanges) {
      toast.info("No changes were made.");
      return;
    }

    updateVehicle(
      { id: vehicleId!, vehicleData: payload },
      {
        onSuccess: () => {
          navigate(`/vehicles/${vehicleId}`);
        },
      }
    );
  };

  // Field errors from the repository's input checks (@carbaddie/core validation.ts).
  const getBackendErrors = (): Record<string, string[]> =>
    mutationError instanceof ValidationError ? mutationError.fieldErrors : {};

  if (isLoading) {
    return (
      <div className="max-w-2xl space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError || !vehicle) {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive">
          Error loading vehicle: {(queryError as any)?.message || "Vehicle not found."}
        </div>
      </div>
    );
  }

  const backendErrors = getBackendErrors();

  return (
    <div className="max-w-2xl space-y-6">
      {/* Contextual Header */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground pb-4 border-b border-border">
        <Link to="/vehicles" className="hover:text-foreground transition-colors flex items-center gap-1">
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Vehicles</span>
        </Link>
        <span className="opacity-40">/</span>
        <Link to={`/vehicles/${vehicle.id}`} className="hover:text-foreground transition-colors">
          {vehicle.make} {vehicle.model}
        </Link>
        <span className="opacity-40">/</span>
        <span className="font-medium text-foreground">Edit</span>
      </div>

      <div>
        <h1 className="text-xl font-medium tracking-tight text-foreground">
          Edit Vehicle Specifications
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Update identification, year, or initial odometer telemetry.
        </p>
      </div>

      {mutationError && !Object.keys(backendErrors).length && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
          {(mutationError as any).response?.data?.detail || (mutationError as any).message}
        </div>
      )}

      <VehicleForm
        initialData={vehicle}
        onSubmit={handleSubmit}
        isSubmitting={isPending}
        backendErrors={backendErrors}
        mode="edit"
      />
    </div>
  );
}
