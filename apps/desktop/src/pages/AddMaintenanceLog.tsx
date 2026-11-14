// Add or edit a garage visit: a header (date, odometer, shop, notes) and one or more service
// items, each stored as a maintenance log. Also edits a log recorded on its own (no visit).
//   /vehicles/:vehicleId/add-log            new visit (?service_type_id= preselects the first item)
//   /vehicles/:vehicleId/visits/:visitId/edit
//   /vehicles/:vehicleId/logs/:logId/edit   a standalone log; a visit's item opens its visit
import { useState, useEffect, FormEvent, useMemo, ReactNode } from "react";
import { useParams, useNavigate, useSearchParams, Link, Navigate } from "react-router-dom";
import {
  useVehicle,
  useServiceTypes,
  useMaintenanceLog,
  useServiceEvent,
  useCustomFieldsForServiceType,
  useAddServiceEvent,
  useUpdateServiceEvent,
  useUpdateMaintenanceLog,
} from "../api";
import { CustomFieldValueCreate, CustomFieldValueRead, Id, ServiceItemUpdate, ServiceTypeRead } from "../types";
import { centsToInput, parseMoney } from "@carbaddie/core";
import { useUnits } from "../hooks/useUnits";
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
import { ChevronLeft, Plus, Trash2 } from "lucide-react";
import { LoadingButton } from "@/components/interior/loading-button";

/** One service item as typed in the form. */
interface ItemDraft {
  key: string;
  /** Set for an item that already exists. */
  id?: Id;
  serviceTypeId: string;
  cost: string;
  notes: string;
  values: Record<string, string>;
}

let nextKey = 0;
const newItem = (serviceTypeId = ""): ItemDraft => ({ key: `item-${++nextKey}`, serviceTypeId, cost: "", notes: "", values: {} });

const draftFrom = (log: {
  id: Id;
  service_type_id?: Id | null;
  cost_cents: number;
  notes?: string | null;
  custom_field_values: CustomFieldValueRead[];
}): ItemDraft => ({
  ...newItem(log.service_type_id ?? ""),
  id: log.id,
  cost: centsToInput(log.cost_cents),
  notes: log.notes ?? "",
  values: Object.fromEntries(log.custom_field_values.map((cfv) => [String(cfv.field_id), cfv.value])),
});

const filledValues = (values: Record<string, string>): CustomFieldValueCreate[] =>
  Object.entries(values)
    .filter(([, value]) => value !== undefined && value !== "")
    .map(([fieldId, value]) => ({ field_id: fieldId, value: String(value) }));

export function AddMaintenanceLogPage() {
  const { vehicleId, logId, visitId } = useParams<{ vehicleId: string; logId?: string; visitId?: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode: "add" | "visit" | "log" = visitId ? "visit" : logId ? "log" : "add";

  // --- React Query Hooks ---
  const { data: vehicle, isLoading: isLoadingVehicle, isError: isVehicleError, error: vehicleError } = useVehicle(vehicleId);
  const { data: serviceTypes = [], isLoading: isLoadingServiceTypes } = useServiceTypes();
  const { data: logToEdit } = useMaintenanceLog(logId);
  const { data: visitToEdit } = useServiceEvent(visitId);
  const addVisit = useAddServiceEvent();
  const updateVisit = useUpdateServiceEvent();
  const updateLog = useUpdateMaintenanceLog();
  const units = useUnits();

  // --- Local UI State ---
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [mileage, setMileage] = useState("");
  const [shop, setShop] = useState("");
  const [notes, setNotes] = useState("");
  const [items, setItems] = useState<ItemDraft[]>(() => [newItem(mode === "add" ? searchParams.get("service_type_id") || "" : "")]);
  // Fill the form once: later refetches (e.g. after a background sync) must not wipe what is being typed.
  const [initialised, setInitialised] = useState(mode === "add");

  useEffect(() => {
    if (initialised || serviceTypes.length === 0) return;
    if (mode === "visit" && visitToEdit) {
      setDate(visitToEdit.date);
      setMileage(units.toDisplay(visitToEdit.mileage).toString());
      setShop(visitToEdit.shop ?? "");
      setNotes(visitToEdit.notes ?? "");
      setItems(visitToEdit.items.length ? visitToEdit.items.map(draftFrom) : [newItem()]);
      setInitialised(true);
    } else if (mode === "log" && logToEdit && !logToEdit.event_id) {
      setDate(logToEdit.date);
      setMileage(units.toDisplay(logToEdit.mileage).toString());
      setItems([draftFrom(logToEdit)]);
      setInitialised(true);
    }
  }, [initialised, mode, visitToEdit, logToEdit, serviceTypes, units]);

  const mainType = useMemo(() => serviceTypes.find((st) => st.id === items[0]?.serviceTypeId), [serviceTypes, items]);
  const suggestions = useMemo(
    () => (mainType?.suggestions ?? []).map((id) => serviceTypes.find((st) => st.id === id)).filter((st): st is ServiceTypeRead => !!st),
    [mainType, serviceTypes]
  );

  const updateItem = (key: string, patch: Partial<ItemDraft>) =>
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  const removeItem = (key: string) => setItems((prev) => (prev.length > 1 ? prev.filter((item) => item.key !== key) : prev));

  /** A co-performed suggestion is an extra item of the visit. */
  const toggleSuggestion = (serviceTypeId: string, checked: boolean) =>
    setItems((prev) =>
      checked
        ? [...prev, newItem(serviceTypeId)]
        : prev.filter((item, index) => index === 0 || item.serviceTypeId !== serviceTypeId)
    );

  const runningTotal = items.reduce((sum, item) => sum + (parseMoney(item.cost) ?? 0), 0);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!vehicleId) return;
    if (items.some((item) => !item.serviceTypeId)) {
      toast.error("Please select a service type for every service");
      return;
    }
    const parsed: ServiceItemUpdate[] = [];
    for (const item of items) {
      const costCents = parseMoney(item.cost);
      if (costCents === null) {
        toast.error("Enter each cost as an amount, e.g. 45.90");
        return;
      }
      parsed.push({
        id: item.id,
        service_type_id: item.serviceTypeId,
        cost_cents: costCents,
        notes: item.notes.trim() || null,
        custom_field_values: filledValues(item.values),
      });
    }
    const mileageKm = units.fromDisplay(parseInt(mileage, 10), visitToEdit?.mileage ?? logToEdit?.mileage);
    const done = { onSuccess: () => navigate(`/vehicles/${vehicleId}`) };

    if (mode === "log" && logId) {
      const [item] = parsed;
      updateLog.mutate(
        {
          logId,
          logData: {
            service_type_id: item.service_type_id,
            date,
            mileage: mileageKm,
            cost_cents: item.cost_cents,
            notes: item.notes,
            custom_field_values: item.custom_field_values,
          },
        },
        done
      );
    } else if (mode === "visit" && visitId) {
      updateVisit.mutate({ visitId, visitData: { date, mileage: mileageKm, shop: shop || null, notes: notes || null, items: parsed } }, done);
    } else {
      addVisit.mutate({ vehicleId, visitData: { date, mileage: mileageKm, shop: shop || null, notes: notes || null, items: parsed } }, done);
    }
  };

  const isSubmitting = addVisit.isPending || updateVisit.isPending || updateLog.isPending;
  const mutationError = addVisit.error || updateVisit.error || updateLog.error;

  // A visit's item is edited with its visit.
  if (mode === "log" && logToEdit?.event_id) {
    return <Navigate to={`/vehicles/${vehicleId}/visits/${logToEdit.event_id}/edit`} replace />;
  }

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

  if (!initialised) {
    return (
      <div className="max-w-2xl space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  const isVisit = mode !== "log";
  const title = mode === "add" ? "Record a Garage Visit" : mode === "visit" ? "Edit Visit" : "Edit Service Record";

  return (
    <div className="max-w-2xl space-y-6">
      {/* Contextual Header */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground pb-4 border-b border-border">
        <Link to={`/vehicles/${vehicle.id}`} className="hover:text-foreground transition-colors flex items-center gap-1">
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>{vehicle.make} {vehicle.model}</span>
        </Link>
        <span className="opacity-40">/</span>
        <span className="font-medium text-foreground">{mode === "add" ? "Add Visit" : mode === "visit" ? "Edit Visit" : "Edit Record"}</span>
      </div>

      <div>
        <h1 className="text-xl font-medium tracking-tight text-foreground">{title}</h1>
        <p className="text-xs text-muted-foreground mt-0.5">
          {isVisit
            ? "One visit, one or more services: date, odometer reading and shop apply to every service."
            : "Record service date, odometer reading, cost, and technician notes."}
        </p>
      </div>

      {mutationError && (
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-xs text-destructive">
          {(mutationError as Error | null)?.message || "An error occurred."}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Visit header */}
        <div className="rounded-lg border border-border bg-card p-5 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
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

            <div className="space-y-1.5">
              <Label htmlFor="mileage" className="text-xs font-medium text-foreground">
                Odometer Reading ({units.unit}) <span className="text-destructive">*</span>
              </Label>
              <Input
                id="mileage"
                type="number"
                placeholder={vehicle?.current_mileage != null ? `e.g. ${units.toDisplay(vehicle.current_mileage)} (current)` : "e.g. 125000"}
                value={mileage}
                onChange={(e) => setMileage(e.target.value)}
                min="0"
                required
                className="h-8 text-xs font-mono bg-background"
              />
            </div>
          </div>

          {isVisit && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="shop" className="text-xs font-medium text-foreground">
                  Shop / Garage
                </Label>
                <Input
                  id="shop"
                  placeholder="e.g. Main Street Auto"
                  value={shop}
                  onChange={(e) => setShop(e.target.value)}
                  className="h-8 text-xs bg-background"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="visit-notes" className="text-xs font-medium text-foreground">
                  Visit Notes
                </Label>
                <Textarea
                  id="visit-notes"
                  placeholder="Invoice number, mechanic recommendations, anything about the visit as a whole..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="text-xs min-h-[60px] bg-background"
                />
              </div>
            </>
          )}
        </div>

        {/* Service items */}
        <div className="space-y-3">
          {isVisit && (
            <div className="flex items-center justify-between pb-2 border-b border-border">
              <h2 className="text-sm font-medium text-foreground">Services</h2>
              <span className="text-xs font-mono text-muted-foreground">
                {items.length} {items.length === 1 ? "item" : "items"} / {units.money(runningTotal)}
              </span>
            </div>
          )}

          {items.map((item, index) => (
            <ServiceItemEditor
              key={item.key}
              item={item}
              index={index}
              serviceTypes={serviceTypes}
              currency={units.currency}
              canRemove={isVisit && items.length > 1}
              onChange={(patch) => updateItem(item.key, patch)}
              onRemove={() => removeItem(item.key)}
            >
              {/* Smart Co-Service Suggestions: each one checked is another item of this visit */}
              {isVisit && index === 0 && suggestions.length > 0 && (
                <div className="rounded border border-amber-500/25 bg-amber-500/5 p-3 text-xs space-y-2">
                  <div className="font-medium text-foreground">Recommended Co-Service Items</div>
                  <p className="text-[11px] text-muted-foreground">
                    Commonly inspected or replaced alongside {mainType?.name}. Select to add them to this visit:
                  </p>
                  <div className="space-y-1.5 pt-1">
                    {suggestions.map((sug) => (
                      <label key={sug.id} className="flex items-center gap-2 cursor-pointer text-xs">
                        <Checkbox
                          checked={items.some((other, i) => i > 0 && other.serviceTypeId === sug.id)}
                          onCheckedChange={(checked) => toggleSuggestion(sug.id, checked === true)}
                        />
                        <span>{sug.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </ServiceItemEditor>
          ))}

          {isVisit && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => setItems((prev) => [...prev, newItem()])}
            >
              <Plus className="h-3.5 w-3.5" />
              Add Service
            </Button>
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
            pendingLabel={mode === "add" ? "Recording..." : "Saving..."}
            className="h-8 text-xs px-3"
          >
            {mode === "add" ? "Record Visit" : "Save Changes"}
          </LoadingButton>
        </div>
      </form>
    </div>
  );
}

interface ServiceItemEditorProps {
  item: ItemDraft;
  index: number;
  serviceTypes: ServiceTypeRead[];
  currency: string;
  canRemove: boolean;
  onChange: (patch: Partial<ItemDraft>) => void;
  onRemove: () => void;
  children?: ReactNode;
}

/** One service of the visit: its type, cost, the type's custom fields and its own notes. */
function ServiceItemEditor({ item, index, serviceTypes, currency, canRemove, onChange, onRemove, children }: ServiceItemEditorProps) {
  const { data: customFields, isLoading: isLoadingCustomFields } = useCustomFieldsForServiceType(item.serviceTypeId || undefined);
  const id = (name: string) => `${name}-${item.key}`;
  const setValue = (fieldId: string, value: string) => onChange({ values: { ...item.values, [fieldId]: value } });

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_10rem_auto] gap-4 items-end">
        <div className="space-y-1.5">
          <Label htmlFor={id("service_type_id")} className="text-xs font-medium text-foreground">
            Service Type <span className="text-destructive">*</span>
          </Label>
          <Select value={item.serviceTypeId} onValueChange={(value) => onChange({ serviceTypeId: value, values: {} })} required>
            <SelectTrigger id={id("service_type_id")} className="h-8 text-xs bg-background">
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
          <Label htmlFor={id("cost")} className="text-xs font-medium text-foreground">
            Cost ({currency})
          </Label>
          <Input
            id={id("cost")}
            type="number"
            placeholder="0.00"
            value={item.cost}
            onChange={(e) => onChange({ cost: e.target.value })}
            min="0"
            step="0.01"
            className="h-8 text-xs font-mono bg-background"
          />
        </div>

        {canRemove && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="h-8 w-8 text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span className="sr-only">Remove service {index + 1}</span>
          </Button>
        )}
      </div>

      {children}

      {/* Technician Notes */}
      <div className="space-y-1.5">
        <Label htmlFor={id("notes")} className="text-xs font-medium text-foreground">
          Notes & Observations
        </Label>
        <Textarea
          id={id("notes")}
          placeholder="Parts replaced, fluid viscosity, brand used..."
          value={item.notes}
          onChange={(e) => onChange({ notes: e.target.value })}
          className="text-xs min-h-[60px] bg-background"
        />
      </div>

      {/* Custom Fields */}
      {isLoadingCustomFields && <Skeleton className="h-8 w-1/2" />}
      {customFields && customFields.length > 0 && (
        <div className="pt-3 border-t border-border space-y-3">
          <p className="text-xs font-medium text-foreground">Category Custom Fields</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {customFields.map((field) => (
              <div key={field.id} className="space-y-1">
                <Label htmlFor={id(`custom-${field.id}`)} className="text-xs text-muted-foreground">
                  {field.name} {field.unit && `(${field.unit})`}
                </Label>
                {field.field_type === "boolean" ? (
                  <div className="flex items-center gap-2 pt-1">
                    <Switch
                      id={id(`custom-${field.id}`)}
                      checked={item.values[field.id] === "true"}
                      onCheckedChange={(checked) => setValue(field.id, checked ? "true" : "false")}
                    />
                    <span className="text-xs font-mono text-muted-foreground">{item.values[field.id] === "true" ? "Yes" : "No"}</span>
                  </div>
                ) : (
                  <Input
                    id={id(`custom-${field.id}`)}
                    type={field.field_type === "date" ? "date" : field.field_type === "number" ? "number" : "text"}
                    step={field.field_type === "number" ? "any" : undefined}
                    value={item.values[field.id] || ""}
                    onChange={(e) => setValue(field.id, e.target.value)}
                    className="h-8 text-xs font-mono bg-background"
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
