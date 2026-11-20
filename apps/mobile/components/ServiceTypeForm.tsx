import { useMemo } from "react";
import React, { useState, useEffect } from "react";
import { StyleSheet, TouchableOpacity, View, Alert, ActivityIndicator } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { useRouter } from "expo-router";
import { useTheme, type Palette } from "@/src/theme";
import {
  useServiceType,
  useServiceTypes,
  useAddServiceType,
  useUpdateServiceType,
  useDeleteServiceType,
} from "@/src/hooks/useDatabase";
import { Text, TextInput } from "@/components/Themed";
import { Icon } from "@/components/Controls";
import { PickerField } from "@/components/PickerField";
import { ZONE_IDS, ZONE_LABEL, parseWholeNumber, serviceTypeZone } from "@carbaddie/core";
import type { CustomFieldCreate } from "@/src/types";
import { useUnits } from "@/src/hooks/useUnits";

const PART_OPTIONS = ZONE_IDS.map((z) => ({ value: z, label: z === "other" ? "Other" : ZONE_LABEL[z] }));

interface FormField extends CustomFieldCreate {
  _key: string;
}

const FIELD_TYPES: Array<{ type: CustomFieldCreate["field_type"]; label: string }> = [
  { type: "text", label: "Text" },
  { type: "number", label: "Number" },
  { type: "date", label: "Date" },
  { type: "boolean", label: "Yes / No" },
];

export default function ServiceTypeForm({ serviceTypeId }: { serviceTypeId?: string }) {
  const isEdit = !!serviceTypeId;
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const { data: existing, isLoading: isLoadingExisting } = useServiceType(isEdit ? serviceTypeId : undefined);
  const { data: allServiceTypes = [] } = useServiceTypes();
  const addMutation = useAddServiceType();
  const updateMutation = useUpdateServiceType();
  const deleteMutation = useDeleteServiceType();
  const units = useUnits();

  const [name, setName] = useState("");
  const [intervalKm, setIntervalKm] = useState("");
  const [intervalDays, setIntervalDays] = useState("");
  const [fields, setFields] = useState<FormField[]>([]);
  const [resets, setResets] = useState<string[]>([]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  // Only a part the user picks is sent, so one a newer app set is kept.
  const [pickedZone, setPickedZone] = useState<string | null>(null);
  const zone = pickedZone ?? serviceTypeZone(existing ?? { slug: null, zone: null });

  useEffect(() => {
    if (existing) {
      setName(existing.name || "");
      setIntervalKm(existing.recommended_interval_km != null ? String(units.toDisplay(existing.recommended_interval_km)) : "");
      setIntervalDays(existing.recommended_interval_days != null ? String(existing.recommended_interval_days) : "");
      setFields(
        (existing.fields || []).map((f) => ({
          _key: `f-${f.id}-${Math.random()}`,
          id: f.id,
          name: f.name,
          field_type: f.field_type,
          unit: f.unit ?? undefined,
        }))
      );
      setResets(existing.resets || []);
      setSuggestions(existing.suggestions || []);
    }
  }, [existing, units]);

  const inputStyle = [
    styles.input,
    { backgroundColor: colors.card, color: colors.text, borderColor: colors.border },
  ];

  const addField = () => {
    setFields((prev) => [
      ...prev,
      { _key: `new-${Date.now()}-${Math.random()}`, name: "", field_type: "text", unit: "" },
    ]);
  };

  const removeField = (_key: string) => {
    setFields((prev) => prev.filter((f) => f._key !== _key));
  };

  const updateField = (_key: string, updates: Partial<FormField>) => {
    setFields((prev) => prev.map((f) => (f._key === _key ? { ...f, ...updates } : f)));
  };

  const toggleReset = (id: string) => {
    setResets((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSuggestion = (id: string) => {
    setSuggestions((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert("Required", "Name is required.");
      return;
    }

    const cleanedFields: CustomFieldCreate[] = fields
      .filter((f) => f.name.trim().length > 0)
      .map((f) => ({
        id: f.id,
        name: f.name.trim(),
        field_type: f.field_type,
        unit: f.unit?.trim() ? f.unit.trim() : undefined,
      }));

    const km = intervalKm.trim() ? parseWholeNumber(intervalKm) : null;
    const days = intervalDays.trim() ? parseWholeNumber(intervalDays) : null;
    if ((intervalKm.trim() && km === null) || (intervalDays.trim() && days === null)) {
      Alert.alert("Check the interval", "Enter each interval as a whole number, e.g. 10000 or 180.");
      return;
    }

    const payload = {
      name: name.trim(),
      recommended_interval_km: km != null ? units.fromDisplay(km, existing?.recommended_interval_km) : undefined,
      recommended_interval_days: days ?? undefined,
      ...(pickedZone !== null ? { zone: pickedZone } : {}),
      fields: cleanedFields,
      resets,
      suggestions,
    };

    if (isEdit) {
      updateMutation.mutate(
        { id: serviceTypeId, data: payload },
        {
          onSuccess: () => router.back(),
          onError: (err) => Alert.alert("Error", err.message || "Failed to update service type."),
        }
      );
    } else {
      addMutation.mutate(payload, {
        onSuccess: () => router.back(),
        onError: (err) => Alert.alert("Error", err.message || "Failed to create service type."),
      });
    }
  };

  const handleDelete = () => {
    if (!isEdit) return;
    Alert.alert(
      "Delete service type",
      `Delete "${existing?.name || name}"? Historical maintenance logs referencing it will retain their text records.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteMutation.mutate(serviceTypeId, {
              onSuccess: () => router.back(),
              onError: (err) => Alert.alert("Error", err.message || "Failed to delete service type."),
            });
          },
        },
      ]
    );
  };

  const isSaving = addMutation.isPending || updateMutation.isPending;
  const isDeleting = deleteMutation.isPending;

  // Filter out self from resets and suggestions candidates
  const candidateCategories = allServiceTypes.filter((st) => !isEdit || st.id !== serviceTypeId);

  if (isEdit && isLoadingExisting) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <KeyboardAwareScrollView bottomOffset={24}
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Category Name */}
      <Text style={[styles.label, { color: colors.text }]}>Name *</Text>
      <TextInput
        style={inputStyle}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Engine Oil & Filter Change"
        placeholderTextColor={colors.textMuted}
      />

      {/* Where it sits on the vehicle: its group in lists and its spot on the garage outline */}
      <Text style={[styles.label, { color: colors.text }]}>Part of the vehicle</Text>
      <PickerField title="Part of the vehicle" value={zone} options={PART_OPTIONS} onChange={(z) => setPickedZone(z ?? "other")} />
      <Text style={[styles.hint, { color: colors.textMuted }]}>Groups it in lists and marks that part on the garage outline</Text>

      {/* Interval Targets */}
      <View style={styles.row}>
        <View style={styles.halfCol}>
          <Text style={[styles.label, { color: colors.text }]}>Interval ({units.unit})</Text>
          <TextInput
            style={inputStyle}
            value={intervalKm}
            onChangeText={setIntervalKm}
            keyboardType="number-pad"
            placeholder="e.g. 10000"
            placeholderTextColor={colors.textMuted}
          />
        </View>
        <View style={styles.halfCol}>
          <Text style={[styles.label, { color: colors.text }]}>Interval (days)</Text>
          <TextInput
            style={inputStyle}
            value={intervalDays}
            onChangeText={setIntervalDays}
            keyboardType="number-pad"
            placeholder="e.g. 180"
            placeholderTextColor={colors.textMuted}
          />
        </View>
      </View>

      {/* Resets Section (Inheritance) */}
      <View style={[styles.section, { borderTopColor: colors.border }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Resets interval countdown</Text>
          {resets.length > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.okBg }]}>
              <Text style={[styles.badgeText, { color: colors.ok }]}>{resets.length} selected</Text>
            </View>
          )}
        </View>
        <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
          When this service is performed, also reset the scheduled countdown for these service types (e.g. Major Service resets Oil Change).
        </Text>

        {candidateCategories.length === 0 ? (
          <Text style={[styles.emptyNote, { color: colors.textMuted }]}>
            No other service types exist yet.
          </Text>
        ) : (
          <View style={styles.chipGrid}>
            {candidateCategories.map((st) => {
              const selected = resets.includes(st.id);
              return (
                <TouchableOpacity accessibilityRole="button"
                  key={`reset-${st.id}`}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected ? colors.okBg : colors.card,
                      borderColor: selected ? colors.ok : colors.border,
                    },
                  ]}
                  accessibilityState={{ selected }}
                  onPress={() => toggleReset(st.id)}
                  activeOpacity={0.7}
                >
                  {selected && <Icon name="check" color={colors.ok} size={14} />}
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? colors.ok : colors.text, fontWeight: selected ? "600" : "500" },
                    ]}
                  >
                    {st.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* Suggestions Section */}
      <View style={[styles.section, { borderTopColor: colors.border }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Co-Performance Suggestions</Text>
          {suggestions.length > 0 && (
            <View style={[styles.badge, { backgroundColor: colors.warnBg }]}>
              <Text style={[styles.badgeText, { color: colors.warn }]}>{suggestions.length} selected</Text>
            </View>
          )}
        </View>
        <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
          When logging this service, suggest these additional maintenance items to perform together (e.g. Brake Pads suggests Brake Rotors).
        </Text>

        {candidateCategories.length === 0 ? (
          <Text style={[styles.emptyNote, { color: colors.textMuted }]}>
            No other service types exist yet.
          </Text>
        ) : (
          <View style={styles.chipGrid}>
            {candidateCategories.map((st) => {
              const selected = suggestions.includes(st.id);
              return (
                <TouchableOpacity accessibilityRole="button"
                  key={`sug-${st.id}`}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected ? colors.warnBg : colors.card,
                      borderColor: selected ? colors.warn : colors.border,
                    },
                  ]}
                  onPress={() => toggleSuggestion(st.id)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? colors.warn : colors.text, fontWeight: selected ? "600" : "500" },
                    ]}
                  >
                    {selected ? "★ " : ""}{st.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </View>

      {/* Custom Fields Section */}
      <View style={[styles.section, { borderTopColor: colors.border }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Custom fields</Text>
          <TouchableOpacity accessibilityRole="button" onPress={addField} style={styles.addFieldBtn}>
            <Text style={[styles.addFieldBtnText, { color: colors.primary }]}>Add field</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.sectionSubtitle, { color: colors.textSecondary }]}>
          Extra values to record on each log, such as oil viscosity or tire tread depth.
        </Text>

        {fields.length === 0 ? (
          <Text style={[styles.emptyNote, { color: colors.textMuted }]}>
            No custom fields for this service type.
          </Text>
        ) : (
          fields.map((field, idx) => (
            <View
              key={field._key}
              style={[styles.fieldCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.fieldCardHeader}>
                <Text style={[styles.fieldCardIndex, { color: colors.textMuted }]}>
                  Field #{idx + 1}
                </Text>
                <TouchableOpacity accessibilityRole="button" onPress={() => removeField(field._key)} style={styles.removeFieldBtn}>
                  <Text style={styles.removeFieldBtnText}>Remove</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.subLabel, { color: colors.text }]}>Field name *</Text>
              <TextInput
                style={inputStyle}
                value={field.name}
                onChangeText={(v) => updateField(field._key, { name: v })}
                placeholder="e.g. Viscosity / Pressure"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={[styles.subLabel, { color: colors.text }]}>Field type</Text>
              <View style={styles.typeSelector}>
                {FIELD_TYPES.map((t) => {
                  const isSelected = field.field_type === t.type;
                  return (
                    <TouchableOpacity accessibilityRole="button"
                      key={t.type}
                      style={[
                        styles.typePill,
                        {
                          backgroundColor: isSelected ? colors.primary : colors.background,
                          borderColor: isSelected ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => updateField(field._key, { field_type: t.type })}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.typePillText,
                          {
                            color: isSelected ? colors.onPrimary : colors.text,
                            fontWeight: isSelected ? "600" : "500",
                          },
                        ]}
                      >
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {(field.field_type === "number" || field.field_type === "text") && (
                <View style={{ marginTop: 8 }}>
                  <Text style={[styles.subLabel, { color: colors.text }]}>Unit of measurement (optional)</Text>
                  <TextInput
                    style={inputStyle}
                    value={field.unit ?? ""}
                    onChangeText={(v) => updateField(field._key, { unit: v })}
                    placeholder="e.g. psi, mm, L, Nm, bar"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              )}
            </View>
          ))
        )}
      </View>

      {/* Save Button */}
      <TouchableOpacity accessibilityRole="button"
        style={[styles.saveBtn, { backgroundColor: colors.primary }]}
        onPress={handleSave}
        disabled={isSaving}
        activeOpacity={0.8}
      >
        {isSaving ? (
          <ActivityIndicator color={colors.onPrimary} size="small" />
        ) : (
          <Text style={styles.saveBtnText}>{isEdit ? "Save changes" : "Create service type"}</Text>
        )}
      </TouchableOpacity>

      {/* Delete Button (Edit mode only) */}
      {isEdit && (
        <TouchableOpacity accessibilityRole="button"
          style={styles.deleteBtn}
          onPress={handleDelete}
          disabled={isDeleting}
          activeOpacity={0.8}
        >
          {isDeleting ? (
            <ActivityIndicator color={colors.danger} size="small" />
          ) : (
            <Text style={styles.deleteBtnText}>Delete service type</Text>
          )}
        </TouchableOpacity>
      )}
    </KeyboardAwareScrollView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, paddingBottom: 50 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 14 },
  hint: { fontSize: 12, marginTop: 6 },
  subLabel: { fontSize: 12, fontWeight: "600", marginBottom: 4, marginTop: 10 },
  row: { flexDirection: "row", gap: 12 },
  halfCol: { flex: 1 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  section: {
    borderTopWidth: 1,
    marginTop: 24,
    paddingTop: 18,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "600",
  },
  sectionSubtitle: {
    fontSize: 12,
    marginTop: 4,
    marginBottom: 12,
    lineHeight: 16,
  },
  emptyNote: {
    fontSize: 12,
    marginVertical: 6,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: "600",
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  chipText: {
    fontSize: 13,
  },
  addFieldBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  addFieldBtnText: {
    fontSize: 13,
    fontWeight: "600",
  },
  fieldCard: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  fieldCardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  fieldCardIndex: {
    fontSize: 12,
    fontWeight: "600",
  },
  removeFieldBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  removeFieldBtnText: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: "600",
  },
  typeSelector: {
    flexDirection: "row",
    gap: 6,
    marginTop: 4,
  },
  typePill: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  typePillText: {
    fontSize: 12,
  },
  saveBtn: {
    marginTop: 32,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  saveBtnText: {
    color: colors.onPrimary,
    fontSize: 15,
    fontWeight: "600",
  },
  deleteBtn: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.dangerBg,
  },
  deleteBtnText: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: "600",
  },
});

