import { useState, useEffect, FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useServiceType, useAddServiceType, useUpdateServiceType } from "../api";
import { ServiceTypeCreate, ServiceTypeUpdate, CustomFieldCreate, CustomFieldRead } from "../types"; // Import CustomFieldRead
import { AxiosError } from "axios";

// UI Components & Icons
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import {
  PlusCircle,
  AlertTriangle,
  Save,
  XCircle,
  Wrench,
  Trash2,
  Settings,
  ListFilter,
  Loader2,
  CalendarClock,
  Gauge,
} from "lucide-react";

// Correctly define FormCustomField based on CustomFieldCreate
interface FormCustomField extends CustomFieldCreate {
  _key: string; // Unique key for React list rendering
}

const availableFieldTypes = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes/No (Checkbox)" },
];

export function AddEditServiceTypePage() {
  const { serviceTypeId } = useParams<{ serviceTypeId?: string }>();
  const isEditMode = Boolean(serviceTypeId);
  const navigate = useNavigate();

  const { data: initialData, isLoading: isInitialLoading, isError: isQueryError, error: queryError } = useServiceType(serviceTypeId);
  const addMutation = useAddServiceType();
  const updateMutation = useUpdateServiceType();
  const isSubmitting = addMutation.isPending || updateMutation.isPending;
  const mutationError = addMutation.error || updateMutation.error;

  const [name, setName] = useState("");
  const [intervalKm, setIntervalKm] = useState("");
  const [intervalDays, setIntervalDays] = useState("");
  const [customFields, setCustomFields] = useState<FormCustomField[]>([]);

  useEffect(() => {
    if (isEditMode && initialData) {
      setName(initialData.name);
      setIntervalKm(initialData.recommended_interval_km?.toString() || "");
      setIntervalDays(initialData.recommended_interval_days?.toString() || "");
      // Correctly map from CustomFieldRead to FormCustomField
      setCustomFields(
        initialData.fields.map((field: CustomFieldRead) => ({
          name: field.name,
          field_type: field.field_type,
          unit: field.unit || "",
          _key: `field-${field.id}`, // Use the stable DB ID for the key
        }))
      );
    }
    // Cleanup function to reset state when leaving the "Add" page
    return () => {
      if (!isEditMode) {
        setName("");
        setIntervalKm("");
        setIntervalDays("");
        setCustomFields([]);
      }
    };
  }, [isEditMode, initialData]);

  const addField = () => setCustomFields([...customFields, { name: "", field_type: "text", unit: "", _key: `new-${Date.now()}` }]);
  const removeField = (key: string) => setCustomFields(customFields.filter((f) => f._key !== key));
  const updateField = (index: number, fieldName: keyof FormCustomField, value: string) => {
    setCustomFields(customFields.map((f, i) => (i === index ? { ...f, [fieldName]: value } : f)));
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const payload = {
      name: name.trim(),
      recommended_interval_km: intervalKm.trim() === "" ? null : parseInt(intervalKm, 10),
      recommended_interval_days: intervalDays.trim() === "" ? null : parseInt(intervalDays, 10),
      fields: customFields.map(({ name, field_type, unit }) => ({ name: name.trim(), field_type, unit: unit?.trim() || undefined })),
    };

    if (isEditMode && serviceTypeId) {
      updateMutation.mutate(
        { id: Number(serviceTypeId), serviceTypeData: payload },
        {
          onSuccess: () => navigate("/service-types/manage"),
        }
      );
    } else {
      addMutation.mutate(payload, {
        onSuccess: () => navigate("/service-types/manage"),
      });
    }
  };

  // Helper to parse and display backend validation errors
  const getFieldError = (fieldName: string): string | undefined => {
    const axiosError = mutationError as AxiosError<{ detail: any[] }>;
    if (axiosError?.response?.status !== 422 || !Array.isArray(axiosError.response.data.detail)) {
      return undefined;
    }
    const error = axiosError.response.data.detail.find((err) => {
      // Match "name" or "fields.0.name" etc.
      const key = err.loc.slice(1).join(".");
      return key === fieldName;
    });
    return error?.msg;
  };

  if (isInitialLoading) {
    return (
      <div className="p-4 md:p-6 max-w-3xl mx-auto animate-pulse">
        {/* Increased max-width slightly */}
        <Skeleton className="h-6 w-3/4 mb-6" /> {/* Breadcrumb */}
        <Card>
          <CardHeader className="pb-4">
            {/* Adjusted padding */}
            <div className="flex items-center gap-3 mb-1">
              <Skeleton className="h-7 w-7 rounded-full" />
              <Skeleton className="h-7 w-48" />
            </div>
            <Skeleton className="h-4 w-2/3" />
          </CardHeader>
          <CardContent className="space-y-6 pt-2">
            {/* Adjusted padding */}
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-1/4" />
              <Skeleton className="h-10 w-full" />
            </div>
            <Separator />
            <div className="flex justify-between items-center mb-3">
              <Skeleton className="h-6 w-1/3" />
              <Skeleton className="h-9 w-28 rounded-md" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-10 w-full" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-10 w-full" />
              </div>
            </div>
            <div className="space-y-4">
              {[1, 2].map((i) => (
                <div key={i} className="p-4 border rounded-md bg-muted/30">
                  {/* Mimic custom field card */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-9 w-full" />
                    </div>
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-9 w-full" />
                    </div>
                    <div className="space-y-1.5">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-9 w-full" />
                    </div>
                  </div>
                  <div className="flex justify-end mt-2">
                    <Skeleton className="h-8 w-8 rounded-md" />
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter className="flex justify-end gap-2 border-t px-6 py-4 bg-muted/50">
            <Skeleton className="h-10 w-24" />
            <Skeleton className="h-10 w-36" /> {/* Adjusted width */}
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (isQueryError) {
    return (
      <div className="p-4 md:p-6 max-w-lg mx-auto text-center">
        <Alert variant="destructive" className="mt-10">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Service Type</AlertTitle>
          <AlertDescription>
            {(queryError as AxiosError<{ detail: string }>)?.response?.data?.detail || "The requested data could not be found or loaded."}
          </AlertDescription>
        </Alert>
        <Button onClick={() => navigate("/service-types/manage")} variant="outline" className="mt-4">
          Back to Manage Service Types
        </Button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      {/* Increased max-width for better form layout */}
      <Breadcrumb className="mb-6">
        {/* ... Breadcrumb content ... */}
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/vehicles">Home</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/service-types/manage">Manage Service Types</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            <BreadcrumbPage>{isEditMode ? "Edit Service Type" : "Create New Service Type"}</BreadcrumbPage>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>
      <Card className="pb-0">
        {/* Main form card */}
        <CardHeader className="pb-4">
          {/* Slightly less padding than default */}
          <div className="flex items-center gap-3 mb-1">
            {isEditMode ? <Settings className="h-6 w-6 text-primary" /> : <Wrench className="h-6 w-6 text-primary" />}
            {/* Adjusted icon size */}
            <CardTitle className="text-xl md:text-2xl">{isEditMode ? "Edit Service Type" : "Create New Service Type"}</CardTitle>
          </div>
          <CardDescription>
            {isEditMode
              ? `Modify '${name || "service type"}' and its custom fields.`
              : "Define a new service type and its associated custom fields."}
          </CardDescription>
        </CardHeader>
        <form onSubmit={handleSubmit}>
          <CardContent className="space-y-6 pt-2 pb-6">
            {/* Adjusted padding */}
            {/* General Error Alert */}
            {mutationError && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>
                  {(mutationError as AxiosError<{ detail: string }>)?.response?.data?.detail || mutationError.message}
                </AlertDescription>
              </Alert>
            )}
            {/* Service Type Name Input */}
            <div className="space-y-1.5">
              <div className="space-y-1.5">
                <Label htmlFor="serviceTypeName">Service Type Name *</Label>
                <Input id="serviceTypeName" value={name} onChange={(e) => setName(e.target.value)} required />
                {getFieldError("name") && <p className="text-xs text-destructive pt-1">{getFieldError("name")}</p>}
              </div>
              {/* {getFieldError("name") && <p className="text-xs text-destructive pt-1">{getFieldError("name")}</p>} */}
            </div>
            <Separator className="my-6" />
            <div>
              <h3 className="text-lg font-semibold flex items-center mb-4">
                <CalendarClock className="mr-2.5 h-5 w-5" />
                Recommended Intervals
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div className="space-y-1.5">
                  <Label htmlFor="intervalKm">By Mileage (km)</Label>
                  <div className="relative">
                    <Gauge className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="intervalKm"
                      type="number"
                      value={intervalKm}
                      onChange={(e) => setIntervalKm(e.target.value)}
                      min="0"
                      className="pl-9"
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="intervalDays">By Time (days)</Label>
                  <div className="relative">
                    <CalendarClock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="intervalDays"
                      type="number"
                      value={intervalDays}
                      onChange={(e) => setIntervalDays(e.target.value)}
                      min="0"
                      className="pl-9"
                    />
                  </div>
                </div>
              </div>
            </div>
            <Separator className="my-6" /> {/* Separator before custom fields */}
            {/* Custom Fields Section */}
            <div>
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-semibold flex items-center">
                  <ListFilter className="mr-2.5 h-5 w-5" />
                  Custom Fields
                </h3>
                <Button type="button" variant="outline" size="sm" onClick={addField} disabled={isSubmitting}>
                  <PlusCircle className="mr-2 h-4 w-4" /> Add Field
                </Button>
              </div>
              <div className="space-y-4">
                {customFields.map((field, index) => (
                  <div key={field._key} className="p-4 border rounded-md bg-muted/20 relative group">
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 items-start">
                      <div className="sm:col-span-2 md:col-span-1">
                        <Label htmlFor={`field-name-${index}`}>Field Name *</Label>
                        <Input
                          id={`field-name-${index}`}
                          value={field.name}
                          onChange={(e) => updateField(index, "name", e.target.value)}
                          required
                        />
                        {getFieldError(`fields.${index}.name`) && (
                          <p className="text-xs text-destructive pt-1">{getFieldError(`fields.${index}.name`)}</p>
                        )}
                      </div>
                      <div>
                        <Label htmlFor={`field-type-${index}`}>Field Type *</Label>
                        <Select
                          value={field.field_type}
                          onValueChange={(value) => updateField(index, "field_type", value as FormCustomField["field_type"])}
                        >
                          <SelectTrigger id={`field-type-${index}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {availableFieldTypes.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value}>
                                {opt.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor={`field-unit-${index}`}>Unit (Optional)</Label>
                        <Input
                          id={`field-unit-${index}`}
                          value={field.unit || ""}
                          onChange={(e) => updateField(index, "unit", e.target.value)}
                        />
                      </div>
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => removeField(field._key)}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>

          <CardFooter className="flex justify-end gap-2 border-t px-6 py-4 bg-muted/50">
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate("/service-types/manage")}
              disabled={isSubmitting}
              className="hover:bg-secondary hover:text-secondary-foreground"
            >
              <XCircle className="mr-2 h-4 w-4" />
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              <>
                {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                {isEditMode ? "Save Changes" : "Create"}
              </>
            </Button>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
