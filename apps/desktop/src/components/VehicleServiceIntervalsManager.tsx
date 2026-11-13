import { useState, useEffect, useMemo } from "react";
import { useUpsertIntervalOverride, useDeleteIntervalOverride } from "../api";
import { ServiceTypeRead, VehicleServiceIntervalOverrideRead } from "../types";
import { toast } from "sonner";

// UI Components & Icons
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2 } from "lucide-react";
import { LoadingButton } from "@/components/interior/loading-button";

interface IntervalFormData {
  [serviceTypeId: string]: {
    km: string;
    days: string;
    isDirty: boolean;
  };
}

interface VehicleServiceIntervalsManagerProps {
  vehicleId: string;
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
  const [manuallyAddedIds, setManuallyAddedIds] = useState<Set<string>>(new Set());
  const [selectedServiceTypeToAdd, setSelectedServiceTypeToAdd] = useState<string>("");

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

  useEffect(() => {
    const newFormData: IntervalFormData = {};
    serviceTypesToDisplay.forEach((st) => {
      const override = currentOverrides.find((ov) => ov.service_type_id === st.id);
      const existingEntry = formData[st.id.toString()];

      newFormData[st.id.toString()] = {
        km: override?.override_interval_km?.toString() || "",
        days: override?.override_interval_days?.toString() || "",
        isDirty: existingEntry?.isDirty || false,
      };
    });
    setFormData(newFormData);
  }, [currentOverrides, serviceTypesToDisplay]);

  const availableServiceTypesForOverride = useMemo(() => {
    const displayedIds = new Set(serviceTypesToDisplay.map((st) => st.id));
    return allServiceTypes.filter((st) => !displayedIds.has(st.id));
  }, [allServiceTypes, serviceTypesToDisplay]);

  const handleInputChange = (serviceTypeId: string, field: "km" | "days", value: string) => {
    setFormData((prev) => ({
      ...prev,
      [serviceTypeId.toString()]: {
        ...prev[serviceTypeId.toString()],
        [field]: value,
        isDirty: true,
      },
    }));
  };

  const handleSave = (serviceTypeId: string) => {
    const data = formData[serviceTypeId.toString()];
    if (!data) return;

    const km = data.km ? parseInt(data.km, 10) : undefined;
    const days = data.days ? parseInt(data.days, 10) : undefined;

    if (km === undefined && days === undefined) {
      handleDelete(serviceTypeId);
      return;
    }

    upsertMutation.mutate(
      {
        vehicleId,
        serviceTypeId,
        overrideData: {
          override_interval_km: km,
          override_interval_days: days,
        },
      },
      {
        onSuccess: () => {
          setFormData((prev) => ({
            ...prev,
            [serviceTypeId.toString()]: {
              ...prev[serviceTypeId.toString()],
              isDirty: false,
            },
          }));
          toast.success("Interval override updated");
        },
      }
    );
  };

  const handleDelete = (serviceTypeId: string) => {
    deleteMutation.mutate(
      { vehicleId, serviceTypeId },
      {
        onSuccess: () => {
          setFormData((prev) => {
            const next = { ...prev };
            delete next[serviceTypeId.toString()];
            return next;
          });
          setManuallyAddedIds((prev) => {
            const next = new Set(prev);
            next.delete(serviceTypeId);
            return next;
          });
          toast.success("Interval reset to default");
        },
      }
    );
  };

  const handleAddOverride = () => {
    if (!selectedServiceTypeToAdd) return;
    const id = selectedServiceTypeToAdd;
    setManuallyAddedIds((prev) => new Set(prev).add(id));
    setSelectedServiceTypeToAdd("");
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-5">
      <div>
        <h3 className="text-sm font-medium text-foreground">
          Service Interval Overrides
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Customize manufacturer recommended maintenance intervals specifically for this vehicle.
        </p>
      </div>

      {/* Add Custom Category Override */}
      {availableServiceTypesForOverride.length > 0 && (
        <div className="flex gap-2">
          <Select value={selectedServiceTypeToAdd} onValueChange={setSelectedServiceTypeToAdd}>
            <SelectTrigger className="h-8 text-xs bg-background flex-1">
              <SelectValue placeholder="Add interval for additional category..." />
            </SelectTrigger>
            <SelectContent>
              {availableServiceTypesForOverride.map((st) => (
                <SelectItem key={st.id} value={st.id.toString()} className="text-xs">
                  {st.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={handleAddOverride}
            disabled={!selectedServiceTypeToAdd}
            className="h-8 text-xs px-3 gap-1"
          >
            <Plus className="h-3.5 w-3.5" />
            Add Override
          </Button>
        </div>
      )}

      {/* Overrides Table */}
      <div className="rounded border border-border overflow-hidden">
        <table className="w-full text-left text-xs">
          <thead className="bg-muted/40 border-b border-border text-muted-foreground font-medium">
            <tr>
              <th className="py-2.5 px-3">Service Category</th>
              <th className="py-2.5 px-3">Default Schedule</th>
              <th className="py-2.5 px-3">Vehicle Override (km)</th>
              <th className="py-2.5 px-3">Vehicle Override (days)</th>
              <th className="py-2.5 px-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {serviceTypesToDisplay.map((st) => {
              const entry = formData[st.id.toString()] || { km: "", days: "", isDirty: false };
              const hasOverride = currentOverrides.some((ov) => ov.service_type_id === st.id);

              return (
                <tr key={st.id} className="hover:bg-accent/15 transition-colors">
                  <td className="py-2.5 px-3 font-medium text-foreground">
                    {st.name}
                  </td>
                  <td className="py-2.5 px-3 font-mono text-[11px] text-muted-foreground">
                    {st.recommended_interval_km ? `${st.recommended_interval_km.toLocaleString()} km` : "—"} /{" "}
                    {st.recommended_interval_days ? `${st.recommended_interval_days} d` : "—"}
                  </td>
                  <td className="py-2.5 px-3">
                    <Input
                      type="number"
                      placeholder={st.recommended_interval_km?.toString() || "km"}
                      value={entry.km}
                      onChange={(e) => handleInputChange(st.id, "km", e.target.value)}
                      className="h-7 text-xs font-mono w-28 bg-background"
                    />
                  </td>
                  <td className="py-2.5 px-3">
                    <Input
                      type="number"
                      placeholder={st.recommended_interval_days?.toString() || "days"}
                      value={entry.days}
                      onChange={(e) => handleInputChange(st.id, "days", e.target.value)}
                      className="h-7 text-xs font-mono w-24 bg-background"
                    />
                  </td>
                  <td className="py-2.5 px-3 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <LoadingButton
                        size="sm"
                        variant={entry.isDirty ? "default" : "outline"}
                        onClick={() => handleSave(st.id)}
                        disabled={!entry.isDirty || upsertMutation.isPending}
                        loading={upsertMutation.isPending}
                        className="h-7 text-[11px] px-2.5"
                      >
                        Save
                      </LoadingButton>
                      {hasOverride && (
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => handleDelete(st.id)}
                          className="h-7 w-7 text-muted-foreground hover:text-destructive"
                          title="Reset to default"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
