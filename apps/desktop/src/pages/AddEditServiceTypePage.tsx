import { useState, useEffect, FormEvent } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import { useServiceType, useAddServiceType, useUpdateServiceType, useServiceTypes } from "../api";
import { ServiceTypeCreate, ServiceTypeUpdate, CustomFieldCreate, ServiceTypeRead } from "../types";
import { useUnits } from "../hooks/useUnits";

// UI Components & Icons
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Trash2, ChevronLeft } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { LoadingButton } from "@/components/interior/loading-button";

interface FormCustomField extends CustomFieldCreate {
  _key: string;
}

const availableFieldTypes = [
  { value: "text", label: "Text" },
  { value: "number", label: "Number" },
  { value: "date", label: "Date" },
  { value: "boolean", label: "Yes/No (Boolean)" },
];

function ServiceTypeCheckboxList({
  allServiceTypes,
  excludeId,
  selected,
  onChange,
}: {
  allServiceTypes: ServiceTypeRead[];
  excludeId?: string;
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const filtered = allServiceTypes.filter((st) => st.id !== excludeId);
  return (
    <div className="space-y-1.5 border border-border rounded p-3 bg-background max-h-48 overflow-y-auto">
      {filtered.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No other service categories available.</p>
      )}
      {filtered.map((st) => (
        <label key={st.id} className="flex items-center gap-2 cursor-pointer text-xs">
          <Checkbox
            checked={selected.includes(st.id)}
            onCheckedChange={(checked) =>
              onChange(checked ? [...selected, st.id] : selected.filter((id) => id !== st.id))
            }
          />
          <span className="truncate">{st.name}</span>
        </label>
      ))}
    </div>
  );
}

export function AddEditServiceTypePage() {
  const { serviceTypeId } = useParams<{ serviceTypeId?: string }>();
  const navigate = useNavigate();
  const isEditMode = Boolean(serviceTypeId);

  const { data: serviceType, isLoading: isQueryLoading, isError: isQueryError, error: queryError } = useServiceType(serviceTypeId);
  const { data: allServiceTypes = [] } = useServiceTypes();
  const addMutation = useAddServiceType();
  const updateMutation = useUpdateServiceType();
  const units = useUnits();

  const [name, setName] = useState("");
  const [recommendedIntervalKm, setRecommendedIntervalKm] = useState("");
  const [recommendedIntervalDays, setRecommendedIntervalDays] = useState("");
  const [customFields, setCustomFields] = useState<FormCustomField[]>([]);
  const [resetIds, setResetIds] = useState<string[]>([]);
  const [suggestionIds, setSuggestionIds] = useState<string[]>([]);

  useEffect(() => {
    if (isEditMode && serviceType) {
      setName(serviceType.name || "");
      setRecommendedIntervalKm(
        serviceType.recommended_interval_km != null ? units.toDisplay(serviceType.recommended_interval_km).toString() : "",
      );
      setRecommendedIntervalDays(serviceType.recommended_interval_days?.toString() || "");
      const loadedFields = (serviceType.fields || []).map((f) => ({
        _key: String(f.id),
        id: f.id,
        name: f.name,
        field_type: f.field_type,
        unit: f.unit || undefined,
      }));
      setCustomFields(loadedFields);
      setResetIds(serviceType.resets || []);
      setSuggestionIds(serviceType.suggestions || []);
    } else if (!isEditMode) {
      setName("");
      setRecommendedIntervalKm("");
      setRecommendedIntervalDays("");
      setCustomFields([]);
      setResetIds([]);
      setSuggestionIds([]);
    }
  }, [isEditMode, serviceType, units]);

  const handleAddField = () => {
    setCustomFields((prev) => [
      ...prev,
      {
        _key: `new-${Date.now()}-${Math.random()}`,
        name: "",
        field_type: "text",
        unit: "",
      },
    ]);
  };

  const handleRemoveField = (_key: string) => {
    setCustomFields((prev) => prev.filter((f) => f._key !== _key));
  };

  const handleFieldChange = (_key: string, fieldName: keyof CustomFieldCreate, value: string) => {
    setCustomFields((prev) =>
      prev.map((f) => (f._key === _key ? { ...f, [fieldName]: value } : f))
    );
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();

    const preparedFields: CustomFieldCreate[] = customFields
      .filter((f) => f.name.trim() !== "")
      .map(({ _key, ...fieldData }) => ({
        ...fieldData,
        unit: fieldData.unit?.trim() || undefined,
      }));

    const km = recommendedIntervalKm ? units.fromDisplay(parseInt(recommendedIntervalKm, 10), serviceType?.recommended_interval_km) : undefined;
    const days = recommendedIntervalDays ? parseInt(recommendedIntervalDays, 10) : undefined;

    if (isEditMode && serviceTypeId) {
      const payload: ServiceTypeUpdate = {
        name: name.trim(),
        recommended_interval_km: km,
        recommended_interval_days: days,
        fields: preparedFields,
        resets: resetIds,
        suggestions: suggestionIds,
      };
      updateMutation.mutate(
        { id: serviceTypeId, serviceTypeData: payload },
        {
          onSuccess: () => navigate("/service-types"),
        }
      );
    } else {
      const payload: ServiceTypeCreate = {
        name: name.trim(),
        recommended_interval_km: km,
        recommended_interval_days: days,
        fields: preparedFields,
        resets: resetIds,
        suggestions: suggestionIds,
      };
      addMutation.mutate(payload, {
        onSuccess: () => navigate("/service-types"),
      });
    }
  };

  const isSubmitting = addMutation.isPending || updateMutation.isPending;
  const mutationError = addMutation.error || updateMutation.error;

  if (isEditMode && isQueryLoading) {
    return (
      <div className="max-w-3xl space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isQueryError) {
    return (
      <div className="max-w-3xl space-y-4">
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive">
          {(queryError as Error | null)?.message || "Could not load service category."}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      {/* Contextual Header */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground pb-4 border-b border-border">
        <Link to="/service-types" className="hover:text-foreground transition-colors flex items-center gap-1">
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Categories</span>
        </Link>
        <span className="opacity-40">/</span>
        <span className="font-medium text-foreground">{isEditMode ? "Edit Category" : "New Category"}</span>
      </div>

      <div>
        <h1 className="text-xl font-medium tracking-tight text-foreground">
          {isEditMode ? `Edit Category: ${name}` : "Create Service Category"}
        </h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          Configure default intervals, co-service suggestions, auto-resets, and custom telemetry fields.
        </p>
      </div>

      {mutationError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
          {(mutationError as Error | null)?.message || "An error occurred."}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-lg border border-border bg-card p-5 space-y-5">
          {/* Category Name */}
          <div className="space-y-1.5">
            <Label htmlFor="name" className="text-xs font-medium text-foreground">
              Category Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="name"
              placeholder="e.g. Synthetic Oil & Filter Service"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              className="h-8 text-xs bg-background"
            />
          </div>

          {/* Recommended Intervals */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="recommendedIntervalKm" className="text-xs font-medium text-foreground">
                Default Interval ({units.unit})
              </Label>
              <Input
                id="recommendedIntervalKm"
                type="number"
                placeholder="e.g. 10000"
                value={recommendedIntervalKm}
                onChange={(e) => setRecommendedIntervalKm(e.target.value)}
                min="0"
                className="h-8 text-xs font-mono bg-background"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="recommendedIntervalDays" className="text-xs font-medium text-foreground">
                Default Interval (days)
              </Label>
              <Input
                id="recommendedIntervalDays"
                type="number"
                placeholder="e.g. 180"
                value={recommendedIntervalDays}
                onChange={(e) => setRecommendedIntervalDays(e.target.value)}
                min="0"
                className="h-8 text-xs font-mono bg-background"
              />
            </div>
          </div>

          {/* Inter-Service Relationships */}
          <div className="pt-3 border-t border-border space-y-4">
            <div>
              <Label className="text-xs font-medium text-foreground">
                Auto-Resets (Cascading Reset)
              </Label>
              <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">
                When this service is performed, automatically reset intervals for these sub-services:
              </p>
              <ServiceTypeCheckboxList
                allServiceTypes={allServiceTypes}
                excludeId={isEditMode && serviceTypeId ? serviceTypeId : undefined}
                selected={resetIds}
                onChange={setResetIds}
              />
            </div>

            <div>
              <Label className="text-xs font-medium text-foreground">
                Smart Co-Service Suggestions
              </Label>
              <p className="text-[11px] text-muted-foreground mt-0.5 mb-2">
                Prompt the mechanic to check or co-perform these services when logging this category:
              </p>
              <ServiceTypeCheckboxList
                allServiceTypes={allServiceTypes}
                excludeId={isEditMode && serviceTypeId ? serviceTypeId : undefined}
                selected={suggestionIds}
                onChange={setSuggestionIds}
              />
            </div>
          </div>

          {/* Custom Telemetry Fields */}
          <div className="pt-3 border-t border-border space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <Label className="text-xs font-medium text-foreground">Custom Fields</Label>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Extra parameters recorded during service (viscosity, brand, tire pressure, etc.)
                </p>
              </div>
              <Button type="button" variant="outline" size="sm" onClick={handleAddField} className="h-7 text-xs px-2.5 gap-1">
                <Plus className="h-3 w-3" /> Add Field
              </Button>
            </div>

            {customFields.length > 0 && (
              <div className="space-y-2 pt-1">
                {customFields.map((field) => (
                  <div key={field._key} className="flex items-center gap-2 p-2 rounded border border-border bg-background">
                    <Input
                      placeholder="Field name (e.g. Oil Grade)"
                      value={field.name}
                      onChange={(e) => handleFieldChange(field._key, "name", e.target.value)}
                      className="h-7 text-xs flex-1"
                    />
                    <Select
                      value={field.field_type}
                      onValueChange={(val) => handleFieldChange(field._key, "field_type", val as any)}
                    >
                      <SelectTrigger className="h-7 text-xs w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {availableFieldTypes.map((t) => (
                          <SelectItem key={t.value} value={t.value} className="text-xs">
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Input
                      placeholder="Unit (e.g. psi, L)"
                      value={field.unit || ""}
                      onChange={(e) => handleFieldChange(field._key, "unit", e.target.value)}
                      className="h-7 text-xs w-24"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveField(field._key)}
                      className="h-7 w-7 text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-end gap-2.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigate("/service-types")}
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
            pendingLabel={isEditMode ? "Saving..." : "Creating..."}
            className="h-8 text-xs px-3"
          >
            {isEditMode ? "Save Category" : "Create Category"}
          </LoadingButton>
        </div>
      </form>
    </div>
  );
}
