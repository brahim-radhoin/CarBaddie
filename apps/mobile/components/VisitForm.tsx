// The garage visit form (add and edit): a header (date, odometer, shop, notes) and one or more
// service items, each saved as a maintenance log of the visit.
import { StyleSheet, TouchableOpacity, View, Alert } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useTheme, type Palette } from "@/src/theme";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode, useMemo } from "react";
import { Text, TextInput } from "@/components/Themed";
import { Icon } from "@/components/Controls";
import { DateField } from "@/components/DateField";
import { PickerField, serviceTypeOptions } from "@/components/PickerField";
import { addDaysISO, todayISO } from "@/src/dates";
import { useVehicle, useServiceTypes, useCustomFieldsForServiceType } from "@/src/hooks/useDatabase";
import { restoreDefaultServiceTypes } from "@/src/db/seed";
import { useUnits } from "@/src/hooks/useUnits";
import { useHistoryChecks } from "@/src/hooks/useHistoryChecks";
import { CustomFieldInput } from "@/components/CustomFieldInput";
import { centsToInput, parseMoney, parseWholeNumber } from "@carbaddie/core";
import type { CustomFieldValueCreate, ServiceEventRead, ServiceItemUpdate, ServiceTypeRead } from "@/src/types";

/** One service item as typed in the form. */
interface ItemDraft {
  key: string;
  /** Set for an item that already exists. */
  id?: string;
  serviceTypeId: string | null;
  cost: string;
  notes: string;
  values: Record<string, string>;
}

export interface VisitFormData {
  date: string;
  /** km */
  mileage: number;
  shop: string | null;
  notes: string | null;
  items: ServiceItemUpdate[];
}

interface VisitFormProps {
  vehicleId: string;
  /** The visit being edited. */
  initial?: ServiceEventRead;
  /** Preselects the first item's service type (new visits). */
  initialServiceTypeId?: string | null;
  saveLabel: string;
  onSubmit: (data: VisitFormData) => Promise<void>;
  /** Shows a delete button (editing). */
  onDelete?: () => void;
}

let nextKey = 0;
const newItem = (serviceTypeId: string | null = null): ItemDraft => ({
  key: `item-${++nextKey}`,
  serviceTypeId,
  cost: "",
  notes: "",
  values: {},
});


export function VisitForm({ vehicleId, initial, initialServiceTypeId, saveLabel, onSubmit, onDelete }: VisitFormProps) {
  const { colors } = useTheme();

  const styles = useMemo(() => makeStyles(colors), [colors]);
  const queryClient = useQueryClient();
  const { data: vehicle } = useVehicle(vehicleId);
  const { data: serviceTypes = [] } = useServiceTypes();
  const units = useUnits();
  const checks = useHistoryChecks(vehicle, { visitId: initial?.id });
  const [isSeeding, setIsSeeding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [date, setDate] = useState(initial?.date ?? todayISO());
  const [mileage, setMileage] = useState(initial ? String(units.toDisplay(initial.mileage)) : "");
  const [shop, setShop] = useState(initial?.shop ?? "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [items, setItems] = useState<ItemDraft[]>(() =>
    initial?.items.length
      ? initial.items.map((log) => ({
          ...newItem(log.service_type_id ?? null),
          id: log.id,
          cost: centsToInput(log.cost_cents),
          notes: log.notes ?? "",
          values: Object.fromEntries(log.custom_field_values.map((cfv) => [cfv.field_id, cfv.value])),
        }))
      : [newItem(initialServiceTypeId ?? null)]
  );

  const handleSeedDefaults = async () => {
    try {
      setIsSeeding(true);
      await restoreDefaultServiceTypes();
      queryClient.invalidateQueries();
    } finally {
      setIsSeeding(false);
    }
  };

  const updateItem = (key: string, patch: Partial<ItemDraft>) =>
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  const removeItem = (key: string) => setItems((prev) => (prev.length > 1 ? prev.filter((item) => item.key !== key) : prev));

  // Co-performed suggestions of the first service: each one checked is another item of this visit.
  const mainType = serviceTypes.find((st) => st.id === items[0]?.serviceTypeId);
  const suggestedTypes = mainType?.suggestions?.length ? serviceTypes.filter((st) => mainType.suggestions.includes(st.id)) : [];
  const isSuggestionChecked = (id: string) => items.some((item, index) => index > 0 && item.serviceTypeId === id);
  const toggleSuggestion = (id: string) =>
    setItems((prev) =>
      isSuggestionChecked(id)
        ? prev.filter((item, index) => index === 0 || item.serviceTypeId !== id)
        : [...prev, newItem(id)]
    );

  const inputStyle = [styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }];

  const setYesterday = () => setDate(addDaysISO(todayISO(), -1));
  const odometerWarning = checks.odometerWarning(date, mileage, initial?.mileage);

  const handleSave = async () => {
    if (!date.trim() || !mileage.trim()) {
      Alert.alert("Required", "Date and mileage are required.");
      return;
    }
    const numMileage = parseWholeNumber(mileage);
    if (numMileage === null) {
      Alert.alert("Check the odometer", "Enter the odometer reading as a whole number, e.g. 55000.");
      return;
    }
    const parsed: ServiceItemUpdate[] = [];
    for (const item of items) {
      const costCents = parseMoney(item.cost);
      if (costCents === null) {
        Alert.alert("Invalid cost", "Enter each cost as an amount, e.g. 45.90");
        return;
      }
      const values: CustomFieldValueCreate[] = Object.entries(item.values)
        .filter(([, v]) => v != null && v.trim().length > 0)
        .map(([fieldId, value]) => ({ field_id: fieldId, value }));
      parsed.push({
        id: item.id,
        service_type_id: item.serviceTypeId,
        cost_cents: costCents,
        notes: item.notes.trim() || null,
        custom_field_values: values,
      });
    }

    try {
      setIsSaving(true);
      await onSubmit({
        date: date.trim(),
        mileage: units.fromDisplay(numMileage, initial?.mileage),
        shop: shop.trim() || null,
        notes: notes.trim() || null,
        items: parsed,
      });
    } catch (e: any) {
      Alert.alert("Could not save visit", e.message ?? "Could not save the visit.");
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate current odometer for placeholder
  const currentOdometer = vehicle?.current_mileage;
  const total = items.reduce((sum, item) => sum + (parseMoney(item.cost) ?? 0), 0);

  return (
    <KeyboardAwareScrollView bottomOffset={24}
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Date Input with Quick Pills */}
      <View style={[styles.dateHeaderRow, { marginTop: 0 }]}>
        <Text style={[styles.label, { color: colors.text, marginTop: 0 }]}>Date *</Text>
        <View style={styles.quickDateRow}>
          <TouchableOpacity accessibilityRole="button" onPress={() => setDate(todayISO())} style={[styles.quickDatePill, { borderColor: colors.border }]}>
            <Text style={[styles.quickDateText, { color: colors.primary }]}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={setYesterday} style={[styles.quickDatePill, { borderColor: colors.border }]}>
            <Text style={[styles.quickDateText, { color: colors.text }]}>Yesterday</Text>
          </TouchableOpacity>
        </View>
      </View>
      <DateField label="Visit date" value={date} onChange={setDate} min={checks.minDate} max={checks.maxDate} />

      {/* Mileage Input */}
      <Text style={[styles.label, { color: colors.text }]}>Odometer ({units.unit}) *</Text>
      <TextInput
        style={inputStyle}
        value={mileage}
        onChangeText={setMileage}
        keyboardType="number-pad"
        placeholder={currentOdometer != null ? `e.g. ${units.toDisplay(currentOdometer)} (current)` : "e.g. 55000"}
        placeholderTextColor={colors.textMuted}
      />
      {odometerWarning && <Text style={[styles.warning, { color: colors.warn }]}>{odometerWarning}</Text>}

      {/* Shop */}
      <Text style={[styles.label, { color: colors.text }]}>Shop / Garage</Text>
      <TextInput style={inputStyle} value={shop} onChangeText={setShop} placeholder="e.g. Main Street Auto" placeholderTextColor={colors.textMuted} />

      {/* Visit notes */}
      <Text style={[styles.label, { color: colors.text }]}>Visit notes</Text>
      <TextInput
        style={[...inputStyle, styles.textArea]}
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={3}
        placeholder="Invoice number, recommendations"
        placeholderTextColor={colors.textMuted}
      />

      {/* Services */}
      <View style={styles.servicesHeader}>
        <Text style={[styles.sectionHeader, { color: colors.primary, marginTop: 0, marginBottom: 0 }]}>Services</Text>
        <Text style={[styles.servicesTotal, { color: colors.textSecondary }]}>
          {items.length} item{items.length !== 1 ? "s" : ""} · {units.money(total)}
        </Text>
      </View>

      {serviceTypes.length === 0 ? (
        <View style={[styles.emptyStBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={{ color: colors.textSecondary, fontSize: 13, marginBottom: 8 }}>No service types found.</Text>
          <TouchableOpacity accessibilityRole="button" style={[styles.seedQuickBtn, { backgroundColor: colors.primary }]} onPress={handleSeedDefaults} disabled={isSeeding}>
            <Text style={styles.seedQuickBtnText}>{isSeeding ? "Loading" : "Load default services"}</Text>
          </TouchableOpacity>
        </View>
      ) : (
        items.map((item, index) => (
          <ServiceItemEditor
            key={item.key}
            item={item}
            index={index}
            serviceTypes={serviceTypes}
            currency={units.currency}
            canRemove={items.length > 1}
            onChange={(patch) => updateItem(item.key, patch)}
            onRemove={() => removeItem(item.key)}
          >
            {index === 0 && suggestedTypes.length > 0 && (
              <View style={[styles.sugBox, { backgroundColor: colors.background, borderColor: colors.border }]}>
                <Text style={[styles.sugTitle, { color: colors.primary }]}>Co-performed Services</Text>
                <Text style={[styles.sugDesc, { color: colors.textSecondary }]}>Check to add them to this visit:</Text>
                <View style={styles.sugRow}>
                  {suggestedTypes.map((sug) => {
                    const isChecked = isSuggestionChecked(sug.id);
                    return (
                      <TouchableOpacity accessibilityRole="button"
                        key={sug.id}
                        style={[
                          styles.sugChip,
                          {
                            borderColor: isChecked ? colors.primary : colors.border,
                            backgroundColor: isChecked ? colors.raised : "transparent",
                          },
                        ]}
                        accessibilityState={{ selected: isChecked }}
                        onPress={() => toggleSuggestion(sug.id)}
                        activeOpacity={0.7}
                      >
                        {isChecked && <Icon name="check" color={colors.text} size={14} />}
                        <Text style={[styles.sugChipText, { color: colors.text, fontWeight: isChecked ? "600" : "500" }]}>
                          {sug.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            )}
          </ServiceItemEditor>
        ))
      )}

      {serviceTypes.length > 0 && (
        <TouchableOpacity accessibilityRole="button"
          style={[styles.addItemBtn, { borderColor: colors.border }]}
          onPress={() => setItems((prev) => [...prev, newItem()])}
          activeOpacity={0.7}
        >
          <Text style={[styles.addItemText, { color: colors.primary }]}>Add another service</Text>
        </TouchableOpacity>
      )}

      {/* Action Buttons */}
      <TouchableOpacity accessibilityRole="button" style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave} disabled={isSaving} activeOpacity={0.8}>
        <Text style={styles.saveBtnText}>{isSaving ? "Saving" : saveLabel}</Text>
      </TouchableOpacity>
      {onDelete && (
        <TouchableOpacity accessibilityRole="button" style={styles.deleteBtn} onPress={onDelete} disabled={isSaving} activeOpacity={0.8}>
          <Text style={styles.deleteBtnText}>Delete visit</Text>
        </TouchableOpacity>
      )}
    </KeyboardAwareScrollView>
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

/** One service of the visit: its category, cost, notes and the category's custom fields. */
function ServiceItemEditor({ item, index, serviceTypes, currency, canRemove, onChange, onRemove, children }: ServiceItemEditorProps) {
  const { colors } = useTheme();

  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { data: customFields } = useCustomFieldsForServiceType(item.serviceTypeId ?? undefined);
  const inputStyle = [styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }];
  const selected = serviceTypes.find((st) => st.id === item.serviceTypeId);
  const resetTypes = selected?.resets?.length ? serviceTypes.filter((st) => selected.resets.includes(st.id)) : [];
  const setValue = (fieldId: string, value: string) => onChange({ values: { ...item.values, [fieldId]: value } });

  return (
    <View style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.itemHeader}>
        <Text style={[styles.itemTitle, { color: colors.text }]}>Service {index + 1}</Text>
        {canRemove && (
          <TouchableOpacity accessibilityRole="button" onPress={onRemove} activeOpacity={0.7}>
            <Text style={styles.removeText}>Remove</Text>
          </TouchableOpacity>
        )}
      </View>

      <PickerField
        title="Service type"
        placeholder="Select a service type"
        value={item.serviceTypeId}
        options={serviceTypeOptions(serviceTypes)}
        allowClear
        clearLabel="No service type"
        onChange={(id) => onChange({ serviceTypeId: id, values: {} })}
        style={styles.pickerField}
      />

      {resetTypes.length > 0 && (
        <Text style={[styles.resetNoticeTitle, { color: colors.textSecondary }]}>
          Resets countdown for: {resetTypes.map((r) => r.name).join(", ")}
        </Text>
      )}

      {children}

      <Text style={[styles.label, { color: colors.text }]}>Cost ({currency})</Text>
      <TextInput
        style={inputStyle}
        value={item.cost}
        onChangeText={(cost) => onChange({ cost })}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor={colors.textMuted}
      />

      <Text style={[styles.label, { color: colors.text }]}>Notes</Text>
      <TextInput
        style={[...inputStyle, styles.textArea]}
        value={item.notes}
        onChangeText={(notes) => onChange({ notes })}
        multiline
        numberOfLines={2}
        placeholder="Parts replaced, observations"
        placeholderTextColor={colors.textMuted}
      />

      {customFields?.map((field) => (
        <CustomFieldInput
          key={field.id}
          field={field}
          value={item.values[field.id] ?? ""}
          onChange={(v) => setValue(field.id, v)}
          inputStyle={inputStyle}
          pillBackground={colors.background}
        />
      ))}
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 50 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 16 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  textArea: { minHeight: 70, textAlignVertical: "top" },
  pickerField: { marginTop: 4, marginBottom: 4 },
  chipScroll: { flexDirection: "row", marginTop: 4, marginBottom: 4 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  emptyStBox: { borderWidth: 1, borderRadius: 12, padding: 14, alignItems: "center" },
  seedQuickBtn: { minHeight: 48, justifyContent: "center", paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  seedQuickBtnText: { color: colors.onPrimary, fontWeight: "600", fontSize: 13 },
  servicesHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 24, marginBottom: 10 },
  servicesTotal: { fontSize: 12, fontWeight: "600" },
  itemCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  itemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  itemTitle: { fontSize: 13, fontWeight: "600" },
  removeText: { color: colors.danger, fontSize: 12, fontWeight: "600" },
  sugBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 10 },
  sugTitle: { fontSize: 13, fontWeight: "600", marginBottom: 4 },
  sugDesc: { fontSize: 12, lineHeight: 16, marginBottom: 10 },
  sugRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sugChip: { minHeight: 40, flexDirection: "row", alignItems: "center", gap: 6, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  sugChipText: { fontSize: 12 },
  resetNoticeTitle: { fontSize: 12, marginTop: 6 },
  dateHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16, marginBottom: 6 },
  quickDateRow: { flexDirection: "row", gap: 6 },
  quickDatePill: { minHeight: 40, justifyContent: "center", borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  quickDateText: { fontSize: 12, fontWeight: "600" },
  warning: { fontSize: 12, marginTop: 6 },
  sectionHeader: { fontSize: 15, fontWeight: "600", marginTop: 12, marginBottom: 4 },
  addItemBtn: { borderWidth: 1, borderStyle: "dashed", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  addItemText: { fontSize: 14, fontWeight: "600" },
  saveBtn: { marginTop: 28, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  saveBtnText: { color: colors.onPrimary, fontSize: 16, fontWeight: "600" },
  deleteBtn: { marginTop: 12, borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: colors.dangerBg, borderWidth: 1, borderColor: colors.border },
  deleteBtnText: { color: colors.danger, fontSize: 14, fontWeight: "600" },
});
