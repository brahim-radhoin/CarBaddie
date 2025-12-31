import { useState, useEffect, FormEvent } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import {
  useVehicle,
  useServiceTypes,
  useMaintenanceLog,
  useCustomFieldsForServiceType,
  useAddMaintenanceLog,
  useUpdateMaintenanceLog,
} from "../api";
import { MaintenanceLogCreate, CustomFieldValueCreate } from "../types";
import { AxiosError } from "axios";

// UI Components & Icons
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent, CardFooter, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, Save, Wrench, Loader2, Edit, ChevronLeft } from "lucide-react";

export function AddMaintenanceLogPage() {
  const { vehicleId, logId } = useParams<{ vehicleId: string; logId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const isEditMode = Boolean(logId);

  // --- React Query Hooks ---
  const { data: vehicle, isLoading: isLoadingVehicle, isError: isVehicleError, error: vehicleError } = useVehicle(vehicleId);
  const { data: serviceTypes = [], isLoading: isLoadingServiceTypes } = useServiceTypes();
  const { data: logToEdit, isLoading: isLoadingLog } = useMaintenanceLog(logId);
  const addMutation = useAddMaintenanceLog();
  const updateMutation = useUpdateMaintenanceLog();

  // --- Local UI State ---
  const [serviceTypeId, setServiceTypeId] = useState<string>(() => (isEditMode ? "" : searchParams.get("service_type_id") || ""));
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [mileage, setMileage] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});
  const [isFormReady, setIsFormReady] = useState(!isEditMode); // Ready immediately in 'add' mode

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
    setIsFormReady(true); // Signal that the form state is populated and ready to render
  }, [isEditMode, logToEdit, serviceTypes]);

  const handleServiceTypeChange = (newId: string) => {
    setServiceTypeId(newId);
    setCustomFieldValues({});
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!vehicleId) return;

    const customValuesPayload: CustomFieldValueCreate[] = Object.entries(customFieldValues)
      .filter(([, value]) => value?.trim() !== "")
      .map(([fieldId, value]) => ({ field_id: Number(fieldId), value }));

    const payload: MaintenanceLogCreate = {
      service_type_id: Number(serviceTypeId),
      date,
      mileage: Number(mileage),
      cost: cost ? Number(cost) : 0,
      notes: notes.trim() || undefined,
      custom_field_values: customValuesPayload,
    };

    if (isEditMode && logId) {
      updateMutation.mutate(
        { logId: Number(logId), logData: payload },
        {
          onSuccess: () => navigate(`/vehicles/${vehicleId}`),
        }
      );
    } else {
      addMutation.mutate(
        { vehicleId: Number(vehicleId), logData: payload },
        {
          onSuccess: () => navigate(`/vehicles/${vehicleId}`),
        }
      );
    }
  };

  const isLoading = isLoadingVehicle || isLoadingServiceTypes || (isEditMode && isLoadingLog);
  const isSubmitting = addMutation.isPending || updateMutation.isPending;
  const mutationError = addMutation.error || updateMutation.error;
  const pageTitle = isEditMode ? "Edit Maintenance Log" : "Add Maintenance Log";

  // --- Skeleton Loader for initial data ---
  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto animate-pulse">
        <Card className="py-0">
          <CardHeader className="bg-muted/50 py-4">
            <div className="flex items-center gap-3">
              <Skeleton className="h-7 w-7 rounded-full" />
              <div>
                <Skeleton className="h-7 w-48 mb-1" />
                <Skeleton className="h-4 w-64" />
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-6 space-y-6">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-4 w-1/4" />
                <Skeleton className="h-10 w-full" />
              </div>
            ))}
          </CardContent>
          <CardFooter className="flex justify-end gap-2 border-t px-6 py-4 bg-muted/50">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-32" />
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (isVehicleError) {
    return (
      <div className="p-4 md:p-6 max-w-md mx-auto">
        <Alert variant="destructive" className="mt-10">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Vehicle</AlertTitle>
          <AlertDescription>
            {(vehicleError as AxiosError<{ detail: string }>)?.response?.data?.detail || "Could not load vehicle data."}
          </AlertDescription>
        </Alert>
        <Button onClick={() => navigate("/vehicles")} variant="outline" className="mt-4 w-full">
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back to Vehicles List
        </Button>
      </div>
    );
  }

  // Only show loader in edit mode if form state is not yet populated from fetched data
  if (isEditMode && !isFormReady) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <Edit className="h-7 w-7 text-primary" />
              <div>
                <CardTitle className="text-2xl">{pageTitle}</CardTitle>
                <CardDescription>
                  For {vehicle?.make} {vehicle?.model}
                </CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Skeleton className="h-10 w-full mb-4" />
            <Skeleton className="h-10 w-full mb-4" />
            <Skeleton className="h-10 w-full mb-4" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            {isEditMode ? <Edit className="h-7 w-7 text-primary" /> : <Wrench className="h-7 w-7 text-primary" />}
            <div>
              <CardTitle className="text-2xl">{pageTitle}</CardTitle>
              <CardDescription>
                For {vehicle?.make} {vehicle?.model}
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="pt-6 space-y-6">
            {mutationError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Submission Error</AlertTitle>
                <AlertDescription>{(mutationError as any)?.response?.data?.detail || "An error occurred."}</AlertDescription>
              </Alert>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="service_type_id">Service Type *</Label>
                <Select name="service_type_id" value={serviceTypeId} onValueChange={handleServiceTypeChange} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select a service type" />
                  </SelectTrigger>
                  <SelectContent>
                    {serviceTypes.map((type) => (
                      <SelectItem key={type.id} value={String(type.id)}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="date">Date *</Label>
                <Input id="date" name="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="mileage">Mileage (km) *</Label>
                <Input
                  id="mileage"
                  name="mileage"
                  type="number"
                  placeholder="e.g., 125000"
                  value={mileage}
                  onChange={(e) => setMileage(e.target.value)}
                  min="0"
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="cost">Cost ($)</Label>
                <Input
                  id="cost"
                  name="cost"
                  type="number"
                  placeholder="e.g., 75.50"
                  value={cost}
                  onChange={(e) => setCost(e.target.value)}
                  min="0"
                  step="0.01"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="notes">Notes</Label>
              <Textarea
                id="notes"
                name="notes"
                placeholder="Any additional details..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            {isLoadingCustomFields && <Skeleton className="h-10 w-1/3" />}
            {customFields && customFields.length > 0 && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Additional Details</h3>
                  {customFields.map((field) => (
                    <div key={field.id} className="space-y-1.5">
                      <Label htmlFor={`custom-${field.id}`}>
                        {field.name} {field.unit && `(${field.unit})`}
                      </Label>
                      <Input
                        id={`custom-${field.id}`}
                        type={field.field_type === "date" ? "date" : "text"}
                        value={customFieldValues[field.id] || ""}
                        onChange={(e) => setCustomFieldValues({ ...customFieldValues, [field.id]: e.target.value })}
                      />
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
          <CardFooter className="flex justify-end gap-2 border-t pt-4 mt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(-1)}
              disabled={isSubmitting}
              className="hover:bg-secondary hover:text-secondary-foreground"
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting || !serviceTypeId}>
              {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              {isEditMode ? "Save Changes" : "Save Log"}
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
