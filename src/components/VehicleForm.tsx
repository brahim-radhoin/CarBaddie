import { useState, useEffect, FormEvent } from "react";
import { VehicleCreate, VehicleRead } from "../types";
import { useGetMakes, useGetModels, useGetYears } from "../hooks/useVehicleDefinitions";
import { cn } from "@/lib/utils";

// UI Components & Icons
import { Button } from "@/components/ui/button";
import { CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Save, XCircle, Loader2, Gauge, CalendarDays } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// This type defines the data our form will manage internally (all strings)
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

  // Data Fetching for Cascading Dropdowns
  // We allow Make -> Model -> Year OR Year -> Make -> Model flow.
  // Ideally, if Year is selected first, Make list is filtered.
  // If Make is selected first, Model is filtered.

  const selectedYear = formData.year ? parseInt(formData.year) : undefined;

  const { data: makes = [] } = useGetMakes(selectedYear);
  const { data: models = [], isFetching: modelsLoading } = useGetModels(formData.make, selectedYear);
  const { data: years = [], isFetching: yearsLoading } = useGetYears(formData.make, formData.model);

  // Effect to sync form if initial data loads after component mount (for edit mode)
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

      // Reset dependent fields if parent changes
      if (name === "make") {
        next.model = "";
        // We don't necessarily reset year, but we could if that year isn't valid for the new make.
        // For now, let's keep it lenient.
      }
      if (name === "year") {
        // If year changes, make/model might still be valid or might not.
        // We won't automatically clear them to allow for "Year First" workflow.
        // But if specific make/model doesn't exist in that year, user might see empty lists if they try to change.
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
      vin: formData.vin.trim() || undefined,
      initial_mileage: formData.initial_mileage ? parseInt(formData.initial_mileage, 10) : undefined,
      acquisition_date: formData.acquisition_date || undefined,
    };
    onSubmit(payload);
  };

  const getFieldError = (fieldName: keyof VehicleFormData): string | undefined => {
    return backendErrors[fieldName]?.join(", ");
  };

  return (
    <form onSubmit={handleSubmit}>
      <CardContent className="space-y-5 pb-5 pt-6">
        {/* Make & Model Selection */}
        <div>
          <p className="text-sm text-muted-foreground mb-3">
            Select your vehicle's make and model. The dropdown options will update based on your selections.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="make">Make *</Label>
              <Select value={formData.make} onValueChange={(val) => handleSelectChange("make", val)} disabled={isSubmitting}>
                <SelectTrigger id="make" className={cn("w-full", getFieldError("make") && "border-destructive")} aria-label="Vehicle make">
                  <SelectValue placeholder="Select Make" />
                </SelectTrigger>
                <SelectContent>
                  {makes.map((make) => (
                    <SelectItem key={make} value={make}>
                      {make}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {getFieldError("make") && <p className="text-xs text-destructive pt-1">{getFieldError("make")}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="model">Model *</Label>
              <Select
                value={formData.model}
                onValueChange={(val) => handleSelectChange("model", val)}
                disabled={!formData.make || isSubmitting || modelsLoading}
              >
                <SelectTrigger
                  id="model"
                  className={cn("w-full", getFieldError("model") && "border-destructive")}
                  aria-label="Vehicle model"
                >
                  <SelectValue placeholder={modelsLoading ? "Loading..." : !formData.make ? "Select make first" : "Select Model"} />
                </SelectTrigger>
                <SelectContent>
                  {models.map((model) => (
                    <SelectItem key={model} value={model}>
                      {model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {getFieldError("model") && <p className="text-xs text-destructive pt-1">{getFieldError("model")}</p>}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="year">Year</Label>
            <Select value={formData.year} onValueChange={(val) => handleSelectChange("year", val)} disabled={isSubmitting}>
              <SelectTrigger id="year" className={cn("w-full", getFieldError("year") && "border-destructive")} aria-label="Vehicle year">
                <SelectValue placeholder={yearsLoading ? "..." : "Select Year"} />
              </SelectTrigger>
              <SelectContent>
                {years.map((year) => (
                  <SelectItem key={year} value={year.toString()}>
                    {year}
                  </SelectItem>
                ))}
                {years.length === 0 &&
                  !formData.make &&
                  Array.from({ length: 30 }, (_, i) => new Date().getFullYear() + 1 - i).map((y) => (
                    <SelectItem key={y} value={y.toString()}>
                      {y}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {getFieldError("year") && <p className="text-xs text-destructive pt-1">{getFieldError("year")}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vin">VIN</Label>
            <Input
              id="vin"
              name="vin"
              value={formData.vin || ""}
              onChange={handleChange}
              minLength={11}
              maxLength={17}
              placeholder="11-17 characters"
            />
            {getFieldError("vin") && <p className="text-xs text-destructive pt-1">{getFieldError("vin")}</p>}
          </div>
        </div>

        <Separator className="my-6" />

        <div>
          <h3 className="text-lg font-medium text-foreground mb-3">
            Initial Vehicle State <span className="text-sm text-muted-foreground">(Optional)</span>
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="initial_mileage">Initial Mileage</Label>
              <div className="relative">
                <Gauge className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="initial_mileage"
                  name="initial_mileage"
                  type="number"
                  value={formData.initial_mileage || ""}
                  onChange={handleChange}
                  min="0"
                  className="pl-9"
                />
              </div>
              {getFieldError("initial_mileage") && <p className="text-xs text-destructive pt-1">{getFieldError("initial_mileage")}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="acquisition_date">Acquisition Date</Label>
              <div className="relative">
                <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="acquisition_date"
                  name="acquisition_date"
                  type="date"
                  value={formData.acquisition_date || ""}
                  onChange={handleChange}
                  className="pl-9"
                />
              </div>
              {getFieldError("acquisition_date") && <p className="text-xs text-destructive pt-1">{getFieldError("acquisition_date")}</p>}
            </div>
          </div>
        </div>
      </CardContent>
      <CardFooter className="flex justify-end gap-2 border-t px-6 py-4 bg-muted/50">
        <Button
          type="button"
          variant="outline"
          onClick={() => navigate(-1)}
          disabled={isSubmitting}
          className="hover:bg-secondary hover:text-secondary-foreground"
        >
          <XCircle className="mr-2 h-4 w-4" /> Cancel
        </Button>
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          {mode === "add" ? "Add Vehicle" : "Save Changes"}
        </Button>
      </CardFooter>
    </form>
  );
}
