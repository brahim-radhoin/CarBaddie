import { useState, useEffect, FormEvent, useMemo } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  useVehicle,
  useServiceTypes,
  useMaintenanceLog,
  useCustomFieldsForServiceType,
  useAddMaintenanceLog,
  useUpdateMaintenanceLog,
} from "../api";
import { MaintenanceLogCreate, CustomFieldValueCreate } from "../types";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";

// UI Components & Icons
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { ChevronLeft } from "lucide-react";
import { LoadingButton } from "@/components/interior/loading-button";

export function AddMaintenanceLogPage() {
  const { vehicleId, logId } = useParams<{ vehicleId: string; logId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEditMode = Boolean(logId);

  // --- React Query Hooks ---
  const { data: vehicle, isLoading: isLoadingVehicle, isError: isVehicleError, error: vehicleError } = useVehicle(vehicleId);
  const { data: serviceTypes = [], isLoading: isLoadingServiceTypes } = useServiceTypes();
  const { data: logToEdit } = useMaintenanceLog(logId);
  const addMutation = useAddMaintenanceLog();
  const updateMutation = useUpdateMaintenanceLog();

  // --- Local UI State ---
  const [serviceTypeId, setServiceTypeId] = useState<string>(() => (isEditMode ? "" : searchParams.get("service_type_id") || ""));
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [mileage, setMileage] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const isFormReady = !isEditMode || (!!logToEdit && serviceTypes.length > 0);
  const [checkedSuggestions, setCheckedSuggestions] = useState<string[]>([]);

  const selectedServiceType = useMemo(
    () => serviceTypes?.find((st) => st.id === serviceTypeId),
    [serviceTypes, serviceTypeId]
  );

  const { data: customFields, isLoading: isLoadingCustomFields } = useCustomFieldsForServiceType(serviceTypeId);

  useEffect(() => {
    if (!isEditMode) return;
    if (!logToEdit || !serviceTypes || serviceTypes.length === 0) return;

    setServiceTypeId(logToEdit.service_type?.id.toString() || "");
    setDate(logToEdit.date);
    setMileage(logToEdit.mileage.toString());
    setCost(logToEdit.cost.toString());
    setNotes(logToEdit.notes || "");
    const initialCustomValues: Record<string, string> = {};
    logToEdit.custom_field_values.forEach((cfv) => {
      initialCustomValues[String(cfv.field_id)] = cfv.value;
    });
    setCustomFieldValues(initialCustomValues);
  }, [isEditMode, logToEdit, serviceTypes]);

  const handleServiceTypeChange = (newId: string) => {
    setServiceTypeId(newId);
    setCustomFieldValues({});
    setCheckedSuggestions([]);
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!vehicleId || !serviceTypeId) {
      toast.error("Please select a service type");
      return;
    }

    const customFieldsPayload: CustomFieldValueCreate[] = Object.entries(customFieldValues)
      .filter(([_, value]) => value !== undefined && value !== "")
      .map(([fieldId, value]) => ({
        field_id: fieldId,
        value: String(value),
      }));

    const payload: MaintenanceLogCreate = {
      service_type_id: serviceTypeId,
      date,
      mileage: parseInt(mileage, 10),
      cost: cost ? parseFloat(cost) : 0,
      notes: notes || undefined,
      custom_field_values: customFieldsPayload,
    };

    if (isEditMode && logId) {
      updateMutation.mutate(
        { logId: logId!, logData: payload },
        {
          onSuccess: () => {
            navigate(`/vehicles/${vehicleId}`);
          },
        }
      );
    } else {
      addMutation.mutate(
        { vehicleId: vehicleId!, logData: payload },
        {
          onSuccess: async () => {
            if (checkedSuggestions.length > 0) {
              for (const sugId of checkedSuggestions) {
                try {
                  await addMutation.mutateAsync({
                    vehicleId: vehicleId!,
                    logData: {
                      service_type_id: sugId,
                      date,
                      mileage: parseInt(mileage, 10),
                      cost: 0,
                      notes: `Co-performed with ${selectedServiceType?.name ?? "service"}`,
                      custom_field_values: [],
                    },
                  });
                } catch (err) {
                  console.error("Failed to add suggested service log:", err);
                }
              }
            }
            navigate(`/vehicles/${vehicleId}`);
          },
        }
      );
    }
  };

  const isSubmitting = addMutation.isPending || updateMutation.isPending;
  const mutationError = addMutation.error || updateMutation.error;

  if (isLoadingVehicle || isLoadingServiceTypes) {
    return (
      <div className="max-w-2xl space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isVehicleError || !vehicle) {
    return (
      <div className="max-w-2xl space-y-4">
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive">
          {(vehicleError as Error | null)?.message || "Could not load vehicle data."}
        </div>
      </div>
    );
  }

  if (isEditMode && !isFormReady) {
    return (
      <div className="max-w-2xl space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      {/* Contextual Header */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground pb-4 border-b border-border">
        <Link to={`/vehicles/${vehicle.id}`} className="hover:text-foreground transition-colors flex items-center gap-1">
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>{vehicle.make} {vehicle.model}</span>
        </Link>
        <span className="opacity-40">/</span>
        <span className="font-medium text-foreground">{isEditMode ? "Edit Record" : "Add Service Record"}</span>
      </div>

      <div>
        <h1 className="text-xl font-medium tracking-tight text-foreground">
          {isEditMode ? "Edit Service Record" : "Log Vehicle Maintenance"}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Record service date, odometer reading, cost, and technician notes.
        </p>
      </div>

      {mutationError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
          {(mutationError as Error | null)?.message || "An error occurred."}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-5 space-y-5">
          {/* Service Type and Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="service_type_id" className="text-xs font-medium text-foreground">
                Service Type <span className="text-destructive">*</span>
              </Label>
              <Select value={serviceTypeId} onValueChange={handleServiceTypeChange} required>
                <SelectTrigger id="service_type_id" className="h-8 text-xs bg-background">
                  <SelectValue placeholder="Select service category" />
                </SelectTrigger>
                <SelectContent>
                  {serviceTypes.map((type) => (
                    <SelectItem key={type.id} value={String(type.id)} className="text-xs">
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="date" className="text-xs font-medium text-foreground">
                Date Completed <span className="text-destructive">*</span>
              </Label>
              <Input
                id="date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="h-8 text-xs font-mono bg-background"
              />
            </div>
          </div>

          {/* Smart Co-Service Suggestions */}
          {!isEditMode && selectedServiceType?.suggestions && selectedServiceType.suggestions.length > 0 && (
            <div className="rounded border border-amber-500/25 bg-amber-500/5 p-3 text-xs space-y-2">
              <div className="font-medium text-foreground">
                Recommended Co-Service Items
              </div>
              <p className="text-[11px] text-muted-foreground">
                Commonly inspected or replaced alongside {selectedServiceType.name}. Select to log at $0 cost:
              </p>
              <div className="space-y-1.5 pt-1">
                {selectedServiceType.suggestions.map((sugId) => {
                  const sugType = serviceTypes.find((st) => st.id === sugId);
                  if (!sugType) return null;
                  return (
                    <label key={sugId} className="flex items-center gap-2 cursor-pointer text-xs">
                      <Checkbox
                        checked={checkedSuggestions.includes(sugId)}
                        onCheckedChange={(checked) => {
                          if (checked) setCheckedSuggestions([...checkedSuggestions, sugId]);
                          else setCheckedSuggestions(checkedSuggestions.filter((id) => id !== sugId));
                        }}
                      />
                      <span>{sugType.name}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          {/* Mileage and Cost */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="mileage" className="text-xs font-medium text-foreground">
                Odometer Reading (km) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="mileage"
                type="number"
                placeholder="e.g. 125000"
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                min="0"
                required
                className="h-8 text-xs font-mono bg-background"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cost" className="text-xs font-medium text-foreground">
                Cost ($)
              </Label>
              <Input
                id="cost"
                type="number"
                placeholder="0.00"
                value={cost}
                onChange={(e) => setCost(e.target.value)}
                min="0"
                step="0.01"
                className="h-8 text-xs font-mono bg-background"
              />
            </div>
          </div>

          {/* Technician Notes */}
          <div className="space-y-1.5">
            <Label htmlFor="notes" className="text-xs font-medium text-foreground">
              Notes & Observations
            </Label>
            <Textarea
              id="notes"
              placeholder="Parts replaced, fluid viscosity, brand used, or mechanic recommendations..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="text-xs min-h-[70px] bg-background"
            />
          </div>

          {/* Custom Fields */}
          {isLoadingCustomFields && <Skeleton className="h-8 w-1/2" />}
          {customFields && customFields.length > 0 && (
            <div className="pt-3 border-t border-border space-y-3">
              <p className="text-xs font-medium text-foreground">
                Category Custom Fields
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {customFields.map((field) => (
                  <div key={field.id} className="space-y-1">
                    <Label htmlFor={`custom-${field.id}`} className="text-xs text-muted-foreground">
                      {field.name} {field.unit && `(${field.unit})`}
                    </Label>
                    {field.field_type === "boolean" ? (
                      <div className="flex items-center gap-2 pt-1">
                        <Switch
                          id={`custom-${field.id}`}
                          checked={customFieldValues[field.id] === "true"}
                          onCheckedChange={(checked) =>
                            setCustomFieldValues({ ...customFieldValues, [field.id]: checked ? "true" : "false" })
                          }
                        />
                        <span className="text-xs font-mono text-muted-foreground">
                          {customFieldValues[field.id] === "true" ? "Yes" : "No"}
                        </span>
                      </div>
                    ) : (
                      <Input
                        id={`custom-${field.id}`}
                        type={field.field_type === "date" ? "date" : field.field_type === "number" ? "number" : "text"}
                        step={field.field_type === "number" ? "any" : undefined}
                        value={customFieldValues[field.id] || ""}
                        onChange={(e) => setCustomFieldValues({ ...customFieldValues, [field.id]: e.target.value })}
                        className="h-8 text-xs font-mono bg-background"
                      />
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Action Controls */}
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
            pendingLabel={isEditMode ? "Saving..." : "Recording..."}
            className="h-8 text-xs px-3"
          >
            {isEditMode ? "Save Changes" : "Record Maintenance"}
          </LoadingButton>
        </div>
      </form>
    </div>
  );
}
