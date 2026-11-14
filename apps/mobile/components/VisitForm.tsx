// The garage visit form (add and edit): a header (date, odometer, shop, notes) and one or more
// service items, each saved as a maintenance log of the visit.
import { StyleSheet, ScrollView, TextInput, TouchableOpacity, View, Alert } from "react-native";
import { useTheme } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { Text } from "@/components/Themed";
import { useVehicle, useServiceTypes, useCustomFieldsForServiceType } from "@/src/hooks/useDatabase";
import { restoreDefaultServiceTypes } from "@/src/db/seed";
import { useUnits } from "@/src/hooks/useUnits";
import { centsToInput, parseMoney } from "@carbaddie/core";
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

const today = () => new Date().toISOString().slice(0, 10);

export function VisitForm({ vehicleId, initial, initialServiceTypeId, saveLabel, onSubmit, onDelete }: VisitFormProps) {
  const { colors } = useTheme();
  const queryClient = useQueryClient();
  const { data: vehicle } = useVehicle(vehicleId);
  const { data: serviceTypes = [] } = useServiceTypes();
  const units = useUnits();
  const [isSeeding, setIsSeeding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [date, setDate] = useState(initial?.date ?? today());
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
  const muted = (alpha: string) => (colors.text as string) + alpha;

  const setYesterday = () => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    setDate(y.toISOString().slice(0, 10));
  };

  const handleSave = async () => {
    if (!date.trim() || !mileage.trim()) {
      Alert.alert("Required", "Date and Mileage are required.");
      return;
    }
    const numMileage = parseInt(mileage, 10);
    if (isNaN(numMileage) || numMileage < 0) {
      Alert.alert("Invalid Mileage", "Please enter a valid mileage.");
      return;
    }
    const parsed: ServiceItemUpdate[] = [];
    for (const item of items) {
      const costCents = parseMoney(item.cost);
      if (costCents === null) {
        Alert.alert("Invalid Cost", "Enter each cost as an amount, e.g. 45.90");
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
      Alert.alert("Error Saving Visit", e.message ?? "Could not save the visit.");
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate current odometer for placeholder
  const currentOdometer = vehicle?.current_mileage;
  const total = items.reduce((sum, item) => sum + (parseMoney(item.cost) ?? 0), 0);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Date Input with Quick Pills */}
      <View style={[styles.dateHeaderRow, { marginTop: 0 }]}>
        <Text style={[styles.label, { color: colors.text, marginTop: 0 }]}>Date (YYYY-MM-DD) *</Text>
        <View style={styles.quickDateRow}>
          <TouchableOpacity onPress={() => setDate(today())} style={[styles.quickDatePill, { borderColor: colors.border }]}>
            <Text style={[styles.quickDateText, { color: colors.primary }]}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={setYesterday} style={[styles.quickDatePill, { borderColor: colors.border }]}>
            <Text style={[styles.quickDateText, { color: colors.text }]}>Yesterday</Text>
          </TouchableOpacity>
        </View>
      </View>
      <TextInput style={inputStyle} value={date} onChangeText={setDate} placeholder="YYYY-MM-DD" placeholderTextColor={muted("55")} />

      {/* Mileage Input */}
      <Text style={[styles.label, { color: colors.text }]}>Odometer Mileage ({units.unit}) *</Text>
      <TextInput
        style={inputStyle}
        value={mileage}
        onChangeText={setMileage}
        keyboardType="numeric"
        placeholder={currentOdometer != null ? `e.g. ${units.toDisplay(currentOdometer)} (current)` : "e.g. 55000"}
        placeholderTextColor={muted("55")}
      />

      {/* Shop */}
      <Text style={[styles.label, { color: colors.text }]}>Shop / Garage</Text>
      <TextInput style={inputStyle} value={shop} onChangeText={setShop} placeholder="e.g. Main Street Auto" placeholderTextColor={muted("55")} />

      {/* Visit notes */}
      <Text style={[styles.label, { color: colors.text }]}>Visit Notes</Text>
      <TextInput
        style={[...inputStyle, styles.textArea]}
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={3}
        placeholder="Invoice number, mechanic recommendations..."
        placeholderTextColor={muted("55")}
      />

      {/* Services */}
      <View style={styles.servicesHeader}>
        <Text style={[styles.sectionHeader, { color: colors.primary, marginTop: 0, marginBottom: 0 }]}>Services</Text>
        <Text style={[styles.servicesTotal, { color: muted("99") }]}>
          {items.length} item{items.length !== 1 ? "s" : ""} · {units.money(total)}
        </Text>
      </View>

      {serviceTypes.length === 0 ? (
        <View style={[styles.emptyStBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={{ color: muted("88"), fontSize: 13, marginBottom: 8 }}>No service types found.</Text>
          <TouchableOpacity style={[styles.seedQuickBtn, { backgroundColor: colors.primary }]} onPress={handleSeedDefaults} disabled={isSeeding}>
            <Text style={styles.seedQuickBtnText}>{isSeeding ? "Loading..." : "Load Default Services"}</Text>
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
                <Text style={[styles.sugDesc, { color: muted("88") }]}>Check to add them to this visit:</Text>
                <View style={styles.sugRow}>
                  {suggestedTypes.map((sug) => {
                    const isChecked = isSuggestionChecked(sug.id);
                    return (
                      <TouchableOpacity
                        key={sug.id}
                        style={[
                          styles.sugChip,
                          {
                            borderColor: isChecked ? colors.primary : colors.border,
                            backgroundColor: isChecked ? (colors.primary as string) + "25" : "transparent",
                          },
                        ]}
                        onPress={() => toggleSuggestion(sug.id)}
                        activeOpacity={0.7}
                      >
                        <Text style={[styles.sugChipText, { color: isChecked ? colors.primary : colors.text, fontWeight: isChecked ? "700" : "500" }]}>
                          {isChecked ? "✓ " : "+ "}
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
        <TouchableOpacity
          style={[styles.addItemBtn, { borderColor: colors.border }]}
          onPress={() => setItems((prev) => [...prev, newItem()])}
          activeOpacity={0.7}
        >
          <Text style={[styles.addItemText, { color: colors.primary }]}>+ Add another service</Text>
        </TouchableOpacity>
      )}

      {/* Action Buttons */}
      <TouchableOpacity style={[styles.saveBtn, { backgroundColor: colors.primary }]} onPress={handleSave} disabled={isSaving} activeOpacity={0.8}>
        <Text style={styles.saveBtnText}>{isSaving ? "Saving..." : saveLabel}</Text>
      </TouchableOpacity>
      {onDelete && (
        <TouchableOpacity style={styles.deleteBtn} onPress={onDelete} disabled={isSaving} activeOpacity={0.8}>
          <Text style={styles.deleteBtnText}>Delete Visit</Text>
        </TouchableOpacity>
      )}
    </ScrollView>
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
  const { data: customFields } = useCustomFieldsForServiceType(item.serviceTypeId ?? undefined);
  const inputStyle = [styles.input, { backgroundColor: colors.background, color: colors.text, borderColor: colors.border }];
  const muted = (alpha: string) => (colors.text as string) + alpha;
  const selected = serviceTypes.find((st) => st.id === item.serviceTypeId);
  const resetTypes = selected?.resets?.length ? serviceTypes.filter((st) => selected.resets.includes(st.id)) : [];
  const setValue = (fieldId: string, value: string) => onChange({ values: { ...item.values, [fieldId]: value } });

  return (
    <View style={[styles.itemCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.itemHeader}>
        <Text style={[styles.itemTitle, { color: colors.text }]}>Service {index + 1}</Text>
        {canRemove && (
          <TouchableOpacity onPress={onRemove} activeOpacity={0.7}>
            <Text style={styles.removeText}>Remove</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
        {serviceTypes.map((st) => (
          <TouchableOpacity
            key={st.id}
            style={[
              styles.chip,
              {
                backgroundColor: item.serviceTypeId === st.id ? colors.primary : colors.background,
                borderColor: item.serviceTypeId === st.id ? colors.primary : colors.border,
              },
            ]}
            onPress={() => onChange({ serviceTypeId: item.serviceTypeId === st.id ? null : st.id, values: {} })}
            activeOpacity={0.7}
          >
            <Text style={{ color: item.serviceTypeId === st.id ? "#fff" : colors.text, fontSize: 13, fontWeight: "600" }}>{st.name}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {resetTypes.length > 0 && (
        <Text style={[styles.resetNoticeTitle, { color: muted("99") }]}>
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
        placeholderTextColor={muted("55")}
      />

      <Text style={[styles.label, { color: colors.text }]}>Notes</Text>
      <TextInput
        style={[...inputStyle, styles.textArea]}
        value={item.notes}
        onChangeText={(notes) => onChange({ notes })}
        multiline
        numberOfLines={2}
        placeholder="Parts replaced, observations..."
        placeholderTextColor={muted("55")}
      />

      {customFields?.map((field) => {
        const currentValue = item.values[field.id] ?? "";
        return (
          <View key={field.id} style={styles.customFieldRow}>
            <Text style={[styles.label, { color: colors.text }]}>
              {field.name}
              {field.unit ? ` (${field.unit})` : ""}
            </Text>
            {field.field_type === "boolean" ? (
              <View style={styles.booleanRow}>
                {(["true", "false"] as const).map((v) => (
                  <TouchableOpacity
                    key={v}
                    style={[
                      styles.booleanPill,
                      {
                        backgroundColor: currentValue === v ? colors.primary : colors.background,
                        borderColor: currentValue === v ? colors.primary : colors.border,
                      },
                    ]}
                    onPress={() => setValue(field.id, v)}
                    activeOpacity={0.7}
                  >
                    <Text style={{ color: currentValue === v ? "#fff" : colors.text, fontWeight: currentValue === v ? "700" : "500", fontSize: 13 }}>
                      {v === "true" ? "Yes" : "No"}
                    </Text>
                  </TouchableOpacity>
                ))}
                {currentValue !== "" && (
                  <TouchableOpacity style={[styles.booleanPillClear, { borderColor: colors.border }]} onPress={() => setValue(field.id, "")}>
                    <Text style={{ color: muted("66"), fontSize: 11 }}>Clear</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <TextInput
                style={inputStyle}
                value={currentValue}
                onChangeText={(v) => setValue(field.id, v)}
                keyboardType={field.field_type === "number" ? "numeric" : "default"}
                placeholder={`Enter ${field.name.toLowerCase()}${field.unit ? ` in ${field.unit}` : ""}`}
                placeholderTextColor={muted("55")}
              />
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 50 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 16 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  textArea: { minHeight: 70, textAlignVertical: "top" },
  chipScroll: { flexDirection: "row", marginTop: 4, marginBottom: 4 },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  emptyStBox: { borderWidth: 1, borderRadius: 12, padding: 14, alignItems: "center" },
  seedQuickBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  seedQuickBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  servicesHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 24, marginBottom: 10 },
  servicesTotal: { fontSize: 12, fontWeight: "600" },
  itemCard: { borderWidth: 1, borderRadius: 14, padding: 14, marginBottom: 12 },
  itemHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  itemTitle: { fontSize: 13, fontWeight: "700" },
  removeText: { color: "#ef4444", fontSize: 12, fontWeight: "700" },
  sugBox: { borderWidth: 1, borderRadius: 12, padding: 12, marginTop: 10 },
  sugTitle: { fontSize: 13, fontWeight: "700", marginBottom: 4 },
  sugDesc: { fontSize: 12, lineHeight: 16, marginBottom: 10 },
  sugRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sugChip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  sugChipText: { fontSize: 12 },
  resetNoticeTitle: { fontSize: 12, fontStyle: "italic", marginTop: 6 },
  dateHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16, marginBottom: 6 },
  quickDateRow: { flexDirection: "row", gap: 6 },
  quickDatePill: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  quickDateText: { fontSize: 11, fontWeight: "600" },
  customFieldRow: { marginBottom: 4 },
  booleanRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  booleanPill: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 9 },
  booleanPillClear: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  sectionHeader: { fontSize: 15, fontWeight: "700", marginTop: 12, marginBottom: 4 },
  addItemBtn: { borderWidth: 1, borderStyle: "dashed", borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  addItemText: { fontSize: 14, fontWeight: "700" },
  saveBtn: { marginTop: 28, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  deleteBtn: { marginTop: 12, borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: "#ef444415", borderWidth: 1, borderColor: "#ef444430" },
  deleteBtnText: { color: "#ef4444", fontSize: 14, fontWeight: "700" },
});
