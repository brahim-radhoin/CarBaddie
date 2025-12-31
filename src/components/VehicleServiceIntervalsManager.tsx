import { useState, useEffect, useMemo } from "react";
import { useUpsertIntervalOverride, useDeleteIntervalOverride } from "../api";
import { ServiceTypeRead, VehicleServiceIntervalOverrideRead } from "../types";
import { toast } from "sonner";

// UI Components & Icons
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from "@/components/ui/select";
import { Save, Trash2, Settings, Gauge, CalendarDays, Info, Loader2, PlusCircle } from "lucide-react";

interface IntervalFormData {
  [serviceTypeId: string]: {
    km: string;
    days: string;
    isDirty: boolean;
  };
}

interface VehicleServiceIntervalsManagerProps {
  vehicleId: number;
  allServiceTypes: ServiceTypeRead[];
  currentOverrides: VehicleServiceIntervalOverrideRead[];
  isLoading: boolean;
}

export function VehicleServiceIntervalsManager({
  vehicleId,
  allServiceTypes,
  currentOverrides,
  isLoading,
}: VehicleServiceIntervalsManagerProps) {
  const upsertMutation = useUpsertIntervalOverride();
  const deleteMutation = useDeleteIntervalOverride();

  const [formData, setFormData] = useState<IntervalFormData>({});
  const [manuallyAddedIds, setManuallyAddedIds] = useState<Set<number>>(new Set());
  const [selectedServiceTypeToAdd, setSelectedServiceTypeToAdd] = useState<string>("");

  // This is the source of truth for which services to show in the UI.
  const serviceTypesToDisplay = useMemo(() => {
    return allServiceTypes
      .filter(
        (st) =>
          st.recommended_interval_km ||
          st.recommended_interval_days ||
          currentOverrides.some((ov) => ov.service_type_id === st.id) ||
          manuallyAddedIds.has(st.id)
      )
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [allServiceTypes, currentOverrides, manuallyAddedIds]);

  // This effect ONLY syncs props to state. It does not depend on other state.
  useEffect(() => {
    const newFormData: IntervalFormData = {};
    // We iterate over the list of types that are meant to be displayed.
    serviceTypesToDisplay.forEach((st) => {
      const override = currentOverrides.find((ov) => ov.service_type_id === st.id);
      // We check if this form item is already being managed to preserve its dirty state on re-renders.
      const existingEntry = formData[st.id.toString()];

      newFormData[st.id.toString()] = {
        km: override?.override_interval_km?.toString() || "",
        days: override?.override_interval_days?.toString() || "",
        isDirty: existingEntry?.isDirty || false, // Preserve dirty state
      };
    });
    setFormData(newFormData);
  }, [currentOverrides, serviceTypesToDisplay]); // Dependency on props only

  const availableServiceTypesForOverride = useMemo(() => {
    const displayedIds = new Set(serviceTypesToDisplay.map((st) => st.id));
    return allServiceTypes.filter((st) => !displayedIds.has(st.id));
  }, [allServiceTypes, serviceTypesToDisplay]);

  const handleAddServiceTypeToManage = () => {
    if (!selectedServiceTypeToAdd) return;
    const newId = Number(selectedServiceTypeToAdd);
    setManuallyAddedIds((prev) => new Set(prev).add(newId));
    setFormData((prev) => ({
      ...prev,
      [selectedServiceTypeToAdd]: { km: "", days: "", isDirty: false },
    }));
    setSelectedServiceTypeToAdd("");
  };

  const handleInputChange = (serviceTypeId: number, field: "km" | "days", value: string) => {
    setFormData((prev) => ({
      ...prev,
      [String(serviceTypeId)]: {
        ...(prev[String(serviceTypeId)] || { km: "", days: "", isDirty: false }),
        [field]: value,
        isDirty: true,
      },
    }));
  };

  const handleSaveOverride = (serviceTypeId: number) => {
    const serviceData = formData[String(serviceTypeId)];
    if (!serviceData) return;

    const payloadKm = serviceData.km.trim() === "" ? null : parseInt(serviceData.km, 10);
    const payloadDays = serviceData.days.trim() === "" ? null : parseInt(serviceData.days, 10);

    if (isNaN(payloadKm as number) || isNaN(payloadDays as number)) {
      toast.error("Intervals must be valid numbers.");
      return;
    }

    upsertMutation.mutate({
      vehicleId,
      serviceTypeId,
      overrideData: {
        override_interval_km: payloadKm,
        override_interval_days: payloadDays,
      },
    });
  };

  const handleDeleteOverride = (serviceTypeId: number) => {
    deleteMutation.mutate(
      { vehicleId, serviceTypeId },
      {
        onSuccess: () => {
          const serviceType = allServiceTypes.find((st) => st.id === serviceTypeId);
          // If the cleared service has no default interval, remove it from the manual list
          // so it disappears from the UI entirely.
          if (serviceType && !serviceType.recommended_interval_km && !serviceType.recommended_interval_days) {
            setManuallyAddedIds((prev) => {
              const newSet = new Set(prev);
              newSet.delete(serviceTypeId);
              return newSet;
            });
          }
        },
      }
    );
  };

  if (isLoading) {
    return (
      <section id="intervals-manager" className="space-y-6">
        <div className="flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">Manage Service Intervals</h2>
        </div>
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-1/2" />
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                  <div className="space-y-1.5 md:col-span-1">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                  <div className="space-y-1.5 md:col-span-1">
                    <Skeleton className="h-4 w-1/3" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                  <div className="md:col-span-1 flex gap-2">
                    <Skeleton className="h-10 w-24" />
                    <Skeleton className="h-10 w-24" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    );
  }

  if (!allServiceTypes.length && !isLoading) {
    return (
      <section id="intervals-manager" className="space-y-6">
        <div className="flex items-center gap-2">
          <Settings className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">Manage Service Intervals</h2>
        </div>
        <Card className="text-center py-8">
          <CardHeader>
            <Info className="mx-auto h-10 w-10 text-muted-foreground mb-2" />
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground">No service types have been defined in the system yet.</p>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section id="intervals-manager" className="space-y-6">
      <div className="flex items-center gap-2">
        <Settings className="h-6 w-6 text-primary" />
        <h2 className="text-2xl font-semibold tracking-tight">Manage Service Intervals</h2>
      </div>
      <CardDescription>Set vehicle-specific intervals. Add a service type to the list to create or update its override.</CardDescription>

      {availableServiceTypesForOverride.length > 0 && (
        <Card className="mt-6 mb-4">
          <CardHeader>
            <CardTitle className="text-lg">Add Override for Another Service Type</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-end gap-3">
              <div className="flex-grow space-y-1.5">
                <Label htmlFor="add-service-type-override">Select Service Type</Label>
                <Select value={selectedServiceTypeToAdd} onValueChange={setSelectedServiceTypeToAdd}>
                  <SelectTrigger id="add-service-type-override">
                    <SelectValue placeholder="Choose a service..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {availableServiceTypesForOverride.map((st) => (
                        <SelectItem key={st.id} value={st.id.toString()}>
                          {st.name}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleAddServiceTypeToManage} disabled={!selectedServiceTypeToAdd} className="w-full sm:w-auto">
                <PlusCircle className="mr-2 h-4 w-4" /> Add to List
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Render the list of managed intervals */}
      <div className="space-y-4">
        {serviceTypesToDisplay.map((st) => {
          const serviceData = formData[st.id.toString()];
          if (!serviceData) return null; // Should not happen with useEffect logic

          // Check if a mutation is running for THIS specific service type
          const isSaving = upsertMutation.isPending && upsertMutation.variables?.serviceTypeId === st.id;
          const isDeleting = deleteMutation.isPending && deleteMutation.variables?.serviceTypeId === st.id;
          const isBusy = isSaving || isDeleting;

          // Check if an override exists in the source data from props
          const overrideExists = currentOverrides.some((ov) => ov.service_type_id === st.id);

          return (
            <Card key={st.id}>
              <CardHeader>
                <CardTitle>{st.name}</CardTitle>
                <CardDescription className="text-xs">{/* Default interval display logic is correct */}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                  <div className="space-y-1.5">
                    <Label htmlFor={`override-km-${st.id}`}>Override Mileage (km)</Label>
                    <div className="relative">
                      <Gauge className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
                      <Input
                        id={`override-km-${st.id}`}
                        type="number"
                        placeholder={`${st.recommended_interval_km || "No default"} km`}
                        value={serviceData.km}
                        onChange={(e) => handleInputChange(st.id, "km", e.target.value)}
                        min="0"
                        className="pl-9"
                        disabled={isBusy}
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor={`override-days-${st.id}`}>Override Time (days)</Label>
                    <div className="relative">
                      <CalendarDays className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" />
                      <Input
                        id={`override-days-${st.id}`}
                        type="number"
                        placeholder={`${st.recommended_interval_days || "No default"} days`}
                        value={serviceData.days}
                        onChange={(e) => handleInputChange(st.id, "days", e.target.value)}
                        min="0"
                        className="pl-9"
                        disabled={isBusy}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="flex justify-end gap-2 border-t px-6 py-3">
                <Button variant="ghost" size="sm" onClick={() => handleDeleteOverride(st.id)} disabled={isBusy || !overrideExists}>
                  {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                  Clear Override
                </Button>
                <Button size="sm" onClick={() => handleSaveOverride(st.id)} disabled={isBusy || !serviceData.isDirty}>
                  {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                  Save
                </Button>
              </CardFooter>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
