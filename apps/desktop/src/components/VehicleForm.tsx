import { useState, useEffect, FormEvent } from "react";
import { VehicleCreate, VehicleRead } from "../types";
import { useGetMakes, useGetModels, useGetYears } from "../hooks/useVehicleDefinitions";
import { cn } from "@/lib/utils";

// UI Components & Icons
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useNavigate } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingButton } from "@/components/interior/loading-button";

type VehicleFormData = Omit<VehicleCreate, "year" | "initial_mileage"> & {
  year: string;
  initial_mileage: string;
};

interface VehicleFormProps {
  initialData?: Partial<VehicleRead>;
  isSubmitting: boolean;
  backendErrors: Record<string, string[]>;
  onSubmit: (payload: VehicleCreate) => void;
  mode: "add" | "edit";
}

export function VehicleForm({ initialData, isSubmitting, backendErrors, onSubmit, mode }: VehicleFormProps) {
  const navigate = useNavigate();
  const [formData, setFormData] = useState<VehicleFormData>({
    make: initialData?.make || "",
    model: initialData?.model || "",
    year: initialData?.year?.toString() || "",
    vin: initialData?.vin || "",
    initial_mileage: initialData?.initial_mileage?.toString() || "",
    acquisition_date: initialData?.acquisition_date || "",
  });

  const selectedYear = formData.year ? parseInt(formData.year) : undefined;
  const { data: makes = [] } = useGetMakes(selectedYear);
  const { data: models = [], isFetching: modelsLoading } = useGetModels(formData.make, selectedYear);
  const { data: years = [], isFetching: yearsLoading } = useGetYears(formData.make, formData.model);

  useEffect(() => {
    if (initialData) {
      setFormData({
        make: initialData.make || "",
        model: initialData.model || "",
        year: initialData.year?.toString() || "",
        vin: initialData.vin || "",
        initial_mileage: initialData.initial_mileage?.toString() || "",
        acquisition_date: initialData.acquisition_date || "",
      });
    }
  }, [initialData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSelectChange = (name: string, value: string) => {
    setFormData((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "make") {
        next.model = "";
      }
      return next;
    });
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const payload: VehicleCreate = {
      make: formData.make.trim(),
      model: formData.model.trim(),
      year: formData.year ? parseInt(formData.year, 10) : undefined,
      vin: formData.vin ? formData.vin.trim() || undefined : undefined,
      initial_mileage: formData.initial_mileage ? parseInt(formData.initial_mileage, 10) : undefined,
      acquisition_date: formData.acquisition_date || undefined,
    };
    onSubmit(payload);
  };

  const getFieldError = (fieldName: keyof VehicleFormData): string | undefined => {
    return backendErrors[fieldName]?.join(", ");
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="rounded-lg border border-border bg-card p-5 space-y-5">
        {/* Make and Model */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="make" className="text-xs font-medium text-foreground">
              Make <span className="text-destructive">*</span>
            </Label>
            <Select value={formData.make} onValueChange={(val) => handleSelectChange("make", val)} disabled={isSubmitting}>
              <SelectTrigger id="make" className={cn("h-8 text-xs bg-background", getFieldError("make") && "border-destructive")}>
                <SelectValue placeholder="Select Make" />
              </SelectTrigger>
              <SelectContent>
                {makes.map((make) => (
                  <SelectItem key={make} value={make} className="text-xs">
                    {make}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {getFieldError("make") && <p className="text-[11px] text-destructive">{getFieldError("make")}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="model" className="text-xs font-medium text-foreground">
              Model <span className="text-destructive">*</span>
            </Label>
            <Select
              value={formData.model}
              onValueChange={(val) => handleSelectChange("model", val)}
              disabled={!formData.make || isSubmitting || modelsLoading}
            >
              <SelectTrigger
                id="model"
                className={cn("h-8 text-xs bg-background", getFieldError("model") && "border-destructive")}
              >
                <SelectValue placeholder={modelsLoading ? "Loading..." : !formData.make ? "Select make first" : "Select Model"} />
              </SelectTrigger>
              <SelectContent>
                {models.map((model) => (
                  <SelectItem key={model} value={model} className="text-xs">
                    {model}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {getFieldError("model") && <p className="text-[11px] text-destructive">{getFieldError("model")}</p>}
          </div>
        </div>

        {/* Year and VIN */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="year" className="text-xs font-medium text-foreground">
              Year
            </Label>
            <Select value={formData.year} onValueChange={(val) => handleSelectChange("year", val)} disabled={isSubmitting}>
              <SelectTrigger id="year" className={cn("h-8 text-xs bg-background", getFieldError("year") && "border-destructive")}>
                <SelectValue placeholder={yearsLoading ? "..." : "Select Year"} />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={year.toString()} className="text-xs">
                    {year}
                  </SelectItem>
                ))}
                {years.length === 0 &&
                  !formData.make &&
                  Array.from({ length: 30 }, (_, i) => new Date().getFullYear() + 1 - i).map((y) => (
                    <SelectItem key={y} value={y.toString()} className="text-xs">
                      {y}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {getFieldError("year") && <p className="text-[11px] text-destructive">{getFieldError("year")}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vin" className="text-xs font-medium text-foreground">
              VIN <span className="text-muted-foreground font-normal">(11-17 alphanumeric)</span>
            </Label>
            <Input
              id="vin"
              name="vin"
              value={formData.vin || ""}
              onChange={handleChange}
              minLength={11}
              maxLength={17}
              placeholder="e.g. 1HGCR2F83HA..."
              className={cn("h-8 text-xs font-mono uppercase bg-background", getFieldError("vin") && "border-destructive")}
            />
            {getFieldError("vin") && <p className="text-[11px] text-destructive">{getFieldError("vin")}</p>}
          </div>
        </div>

        {/* Initial Telemetry & Odometer */}
        <div className="pt-3 border-t border-border">
          <p className="text-xs font-medium text-foreground mb-3">
            Initial Telemetry
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="initial_mileage" className="text-xs font-medium text-muted-foreground">
                Starting Odometer (km)
              </Label>
              <Input
                id="initial_mileage"
                name="initial_mileage"
                type="number"
                value={formData.initial_mileage || ""}
                onChange={handleChange}
                min="0"
                placeholder="0"
                className={cn("h-8 text-xs font-mono bg-background", getFieldError("initial_mileage") && "border-destructive")}
              />
              {getFieldError("initial_mileage") && (
                <p className="text-[11px] text-destructive">{getFieldError("initial_mileage")}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="acquisition_date" className="text-xs font-medium text-muted-foreground">
                Acquisition Date
              </Label>
              <Input
                id="acquisition_date"
                name="acquisition_date"
                type="date"
                value={formData.acquisition_date || ""}
                onChange={handleChange}
                className={cn("h-8 text-xs font-mono bg-background", getFieldError("acquisition_date") && "border-destructive")}
              />
              {getFieldError("acquisition_date") && (
                <p className="text-[11px] text-destructive">{getFieldError("acquisition_date")}</p>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Form Action Controls */}
      <div className="flex items-center justify-end gap-2.5">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => navigate(-1)}
          disabled={isSubmitting}
          className="h-8 text-xs px-3"
        >
          Cancel
        </Button>
        <LoadingButton
          type="submit"
          variant="default"
          size="sm"
          loading={isSubmitting}
          disabled={isSubmitting}
          pendingLabel={mode === "add" ? "Registering..." : "Saving..."}
          className="h-8 text-xs px-3"
        >
          {mode === "add" ? "Register Vehicle" : "Save Changes"}
        </LoadingButton>
      </div>
    </form>
  );
}
