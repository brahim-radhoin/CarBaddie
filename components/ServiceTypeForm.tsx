import React, { useState, useEffect } from "react";
import { StyleSheet, ScrollView, TextInput, TouchableOpacity, View, Alert, ActivityIndicator } from "react-native";
import { useRouter, useTheme } from "expo-router";
import {
  useServiceType,
  useServiceTypes,
  useAddServiceType,
  useUpdateServiceType,
  useDeleteServiceType,
} from "@/src/hooks/useDatabase";
import { Text } from "@/components/Themed";
import type { CustomFieldCreate } from "@/src/types";

interface FormField extends CustomFieldCreate {
  _key: string;
}

const FIELD_TYPES: Array<{ type: CustomFieldCreate["field_type"]; label: string }> = [
  { type: "text", label: "Text" },
  { type: "number", label: "Number" },
  { type: "date", label: "Date" },
  { type: "boolean", label: "Yes / No" },
];

export default function ServiceTypeForm({ serviceTypeId }: { serviceTypeId?: number }) {
  const isEdit = typeof serviceTypeId === "number" && !isNaN(serviceTypeId);
  const { colors } = useTheme();
  const router = useRouter();

  const { data: existing, isLoading: isLoadingExisting } = useServiceType(isEdit ? serviceTypeId : undefined);
  const { data: allServiceTypes = [] } = useServiceTypes();
  const addMutation = useAddServiceType();
  const updateMutation = useUpdateServiceType();
  const deleteMutation = useDeleteServiceType();

  const [name, setName] = useState("");
  const [intervalKm, setIntervalKm] = useState("");
  const [intervalDays, setIntervalDays] = useState("");
  const [fields, setFields] = useState<FormField[]>([]);
  const [resets, setResets] = useState<number[]>([]);
  const [suggestions, setSuggestions] = useState<number[]>([]);

  useEffect(() => {
    if (existing) {
      setName(existing.name || "");
      setIntervalKm(existing.recommended_interval_km != null ? String(existing.recommended_interval_km) : "");
      setIntervalDays(existing.recommended_interval_days != null ? String(existing.recommended_interval_days) : "");
      setFields(
        (existing.fields || []).map((f) => ({
          _key: `f-${f.id}-${Math.random()}`,
          name: f.name,
          field_type: f.field_type,
          unit: f.unit ?? undefined,
        }))
      );
      setResets(existing.resets || []);
      setSuggestions(existing.suggestions || []);
    }
  }, [existing]);

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

  const toggleReset = (id: number) => {
    setResets((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleSuggestion = (id: number) => {
    setSuggestions((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert("Required", "Service category name is required.");
      return;
    }

    const cleanedFields: CustomFieldCreate[] = fields
      .filter((f) => f.name.trim().length > 0)
      .map((f) => ({
        name: f.name.trim(),
        field_type: f.field_type,
        unit: f.unit?.trim() ? f.unit.trim() : undefined,
      }));

    const payload = {
      name: name.trim(),
      recommended_interval_km: intervalKm ? Number(intervalKm) : undefined,
      recommended_interval_days: intervalDays ? Number(intervalDays) : undefined,
      fields: cleanedFields,
      resets,
      suggestions,
    };

    if (isEdit) {
      updateMutation.mutate(
        { id: serviceTypeId, data: payload },
        {
          onSuccess: () => router.back(),
          onError: (err) => Alert.alert("Error", err.message || "Failed to update category."),
        }
      );
    } else {
      addMutation.mutate(payload, {
        onSuccess: () => router.back(),
        onError: (err) => Alert.alert("Error", err.message || "Failed to create category."),
      });
    }
  };

  const handleDelete = () => {
    if (!isEdit) return;
    Alert.alert(
      "Delete Service Category",
      `Delete "${existing?.name || name}"? Historical maintenance logs referencing it will retain their text records.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteMutation.mutate(serviceTypeId, {
              onSuccess: () => router.back(),
              onError: (err) => Alert.alert("Error", err.message || "Failed to delete category."),
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
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Category Name */}
      <Text style={[styles.label, { color: colors.text }]}>Category Name *</Text>
      <TextInput
        style={inputStyle}
        value={name}
        onChangeText={setName}
        placeholder="e.g. Engine Oil & Filter Change"
        placeholderTextColor={(colors.text as string) + "55"}
      />

      {/* Interval Targets */}
      <View style={styles.row}>
        <View style={styles.halfCol}>
          <Text style={[styles.label, { color: colors.text }]}>Interval (km)</Text>
          <TextInput
            style={inputStyle}
            value={intervalKm}
            onChangeText={setIntervalKm}
            keyboardType="numeric"
            placeholder="e.g. 10000"
            placeholderTextColor={(colors.text as string) + "55"}
          />
        </View>
        <View style={styles.halfCol}>
          <Text style={[styles.label, { color: colors.text }]}>Interval (days)</Text>
          <TextInput
            style={inputStyle}
            value={intervalDays}
            onChangeText={setIntervalDays}
            keyboardType="numeric"
            placeholder="e.g. 180"
            placeholderTextColor={(colors.text as string) + "55"}
          />
        </View>
      </View>

      {/* Resets Section (Inheritance) */}
      <View style={[styles.section, { borderTopColor: colors.border }]}>
        <View style={styles.sectionHeader}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Resets Interval Countdown</Text>
          {resets.length > 0 && (
            <View style={[styles.badge, { backgroundColor: "#10b98120" }]}>
              <Text style={[styles.badgeText, { color: "#10b981" }]}>{resets.length} selected</Text>
            </View>
          )}
        </View>
        <Text style={[styles.sectionSubtitle, { color: (colors.text as string) + "88" }]}>
          When this service is performed, also reset the scheduled countdown for these categories (e.g. Major Service resets Oil Change).
        </Text>

        {candidateCategories.length === 0 ? (
          <Text style={[styles.emptyNote, { color: (colors.text as string) + "55" }]}>
            No other service categories exist yet.
          </Text>
        ) : (
          <View style={styles.chipGrid}>
            {candidateCategories.map((st) => {
              const selected = resets.includes(st.id);
              return (
                <TouchableOpacity
                  key={`reset-${st.id}`}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected ? "#10b98125" : colors.card,
                      borderColor: selected ? "#10b981" : colors.border,
                    },
                  ]}
                  onPress={() => toggleReset(st.id)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? "#10b981" : colors.text, fontWeight: selected ? "700" : "500" },
                    ]}
                  >
                    {selected ? "✓ " : ""}{st.name}
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
            <View style={[styles.badge, { backgroundColor: "#f59e0b20" }]}>
              <Text style={[styles.badgeText, { color: "#f59e0b" }]}>{suggestions.length} selected</Text>
            </View>
          )}
        </View>
        <Text style={[styles.sectionSubtitle, { color: (colors.text as string) + "88" }]}>
          When logging this service, suggest these additional maintenance items to perform together (e.g. Brake Pads suggests Brake Rotors).
        </Text>

        {candidateCategories.length === 0 ? (
          <Text style={[styles.emptyNote, { color: (colors.text as string) + "55" }]}>
            No other service categories exist yet.
          </Text>
        ) : (
          <View style={styles.chipGrid}>
            {candidateCategories.map((st) => {
              const selected = suggestions.includes(st.id);
              return (
                <TouchableOpacity
                  key={`sug-${st.id}`}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected ? "#f59e0b25" : colors.card,
                      borderColor: selected ? "#f59e0b" : colors.border,
                    },
                  ]}
                  onPress={() => toggleSuggestion(st.id)}
                  activeOpacity={0.7}
                >
                  <Text
                    style={[
                      styles.chipText,
                      { color: selected ? "#f59e0b" : colors.text, fontWeight: selected ? "700" : "500" },
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
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Custom Fields</Text>
          <TouchableOpacity onPress={addField} style={styles.addFieldBtn}>
            <Text style={[styles.addFieldBtnText, { color: colors.primary }]}>+ Add Field</Text>
          </TouchableOpacity>
        </View>
        <Text style={[styles.sectionSubtitle, { color: (colors.text as string) + "88" }]}>
          Track specialized telemetry on logs (e.g., Oil Viscosity, Tire Tread Depth, Torque Specs).
        </Text>

        {fields.length === 0 ? (
          <Text style={[styles.emptyNote, { color: (colors.text as string) + "55" }]}>
            No custom fields configured for this category.
          </Text>
        ) : (
          fields.map((field, idx) => (
            <View
              key={field._key}
              style={[styles.fieldCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.fieldCardHeader}>
                <Text style={[styles.fieldCardIndex, { color: (colors.text as string) + "66" }]}>
                  Field #{idx + 1}
                </Text>
                <TouchableOpacity onPress={() => removeField(field._key)} style={styles.removeFieldBtn}>
                  <Text style={styles.removeFieldBtnText}>Remove</Text>
                </TouchableOpacity>
              </View>

              <Text style={[styles.subLabel, { color: colors.text }]}>Field Name *</Text>
              <TextInput
                style={inputStyle}
                value={field.name}
                onChangeText={(v) => updateField(field._key, { name: v })}
                placeholder="e.g. Viscosity / Pressure"
                placeholderTextColor={(colors.text as string) + "55"}
              />

              <Text style={[styles.subLabel, { color: colors.text }]}>Field Type</Text>
              <View style={styles.typeSelector}>
                {FIELD_TYPES.map((t) => {
                  const isSelected = field.field_type === t.type;
                  return (
                    <TouchableOpacity
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
                            color: isSelected ? "#fff" : (colors.text as string),
                            fontWeight: isSelected ? "700" : "500",
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
                  <Text style={[styles.subLabel, { color: colors.text }]}>Unit of Measurement (Optional)</Text>
                  <TextInput
                    style={inputStyle}
                    value={field.unit ?? ""}
                    onChangeText={(v) => updateField(field._key, { unit: v })}
                    placeholder="e.g. psi, mm, L, Nm, bar"
                    placeholderTextColor={(colors.text as string) + "55"}
                  />
                </View>
              )}
            </View>
          ))
        )}
      </View>

      {/* Save Button */}
      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: colors.primary }]}
        onPress={handleSave}
        disabled={isSaving}
        activeOpacity={0.8}
      >
        {isSaving ? (
          <ActivityIndicator color="#fff" size="small" />
        ) : (
          <Text style={styles.saveBtnText}>{isEdit ? "Save Category Changes" : "Create Service Category"}</Text>
        )}
      </TouchableOpacity>

      {/* Delete Button (Edit mode only) */}
      {isEdit && (
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={handleDelete}
          disabled={isDeleting}
          activeOpacity={0.8}
        >
          {isDeleting ? (
            <ActivityIndicator color="#ef4444" size="small" />
          ) : (
            <Text style={styles.deleteBtnText}>Delete Service Category</Text>
          )}
        </TouchableOpacity>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, paddingBottom: 50 },
  label: { fontSize: 13, fontWeight: "700", marginBottom: 6, marginTop: 14, letterSpacing: 0.2 },
  subLabel: { fontSize: 11, fontWeight: "600", marginBottom: 4, marginTop: 10, letterSpacing: 0.1 },
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
    fontWeight: "700",
  },
  sectionSubtitle: {
    fontSize: 12,
    marginTop: 4,
    marginBottom: 12,
    lineHeight: 16,
  },
  emptyNote: {
    fontSize: 12,
    fontStyle: "italic",
    marginVertical: 6,
  },
  badge: {
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
  chipGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 4,
  },
  chip: {
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
    fontWeight: "700",
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
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  removeFieldBtn: {
    paddingVertical: 2,
    paddingHorizontal: 6,
  },
  removeFieldBtnText: {
    color: "#ef4444",
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
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
  },
  deleteBtn: {
    marginTop: 12,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#ef444415",
  },
  deleteBtnText: {
    color: "#ef4444",
    fontSize: 14,
    fontWeight: "700",
  },
});

