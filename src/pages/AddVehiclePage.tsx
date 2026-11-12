import { useNavigate, Link } from "react-router-dom";
import { useAddVehicle } from "../api";
import { VehicleCreate } from "../types";
import { VehicleForm } from "@/components/VehicleForm";
import { AxiosError } from "axios";
import { ChevronLeft } from "lucide-react";

export function AddVehiclePage() {
  const navigate = useNavigate();
  const { mutate: addVehicle, isPending, error } = useAddVehicle();

  const handleSubmit = (payload: VehicleCreate) => {
    addVehicle(payload, {
      onSuccess: () => {
        navigate("/vehicles");
      },
    });
  };

  const getBackendErrors = () => {
    const axiosError = error as AxiosError<{ detail: any }>;
    if (axiosError?.response?.status === 422 && axiosError.response.data.detail) {
      return axiosError.response.data.detail.reduce((acc: Record<string, string[]>, err: any) => {
        const fieldKey = err.loc[1] || "general";
        acc[fieldKey] = acc[fieldKey] ? [...acc[fieldKey], err.msg] : [err.msg];
        return acc;
      }, {});
    }
    return {};
  };

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
        <span className="font-medium text-foreground">Add Vehicle</span>
      </div>

      <div>
        <h1 className="text-xl font-medium tracking-tight text-foreground">
          Register New Vehicle
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Enter make, model, year, and starting odometer reading to initialize telemetry.
        </p>
      </div>

      {error && !Object.keys(backendErrors).length && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
          {(error as any).response?.data?.detail || error.message}
        </div>
      )}

      <VehicleForm
        onSubmit={handleSubmit}
        isSubmitting={isPending}
        backendErrors={backendErrors}
        mode="add"
      />
    </div>
  );
}
