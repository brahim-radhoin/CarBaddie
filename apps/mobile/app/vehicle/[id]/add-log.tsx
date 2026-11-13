import { StyleSheet, ScrollView, TextInput, TouchableOpacity, View, Alert } from "react-native";
import { useLocalSearchParams, useRouter, useTheme } from "expo-router";
import { useVehicle, useServiceTypes, useAddMaintenanceLog, useCustomFieldsForServiceType } from "@/src/hooks/useDatabase";
import { restoreDefaultServiceTypes } from "@/src/db/seed";
import { useQueryClient } from "@tanstack/react-query";
import { Text } from "@/components/Themed";
import { useState, useEffect } from "react";
import type { CustomFieldValueCreate } from "@/src/types";

export default function AddLogScreen() {
  const params = useLocalSearchParams<{ id: string; serviceTypeId?: string }>();
  const vehicleId = params.id;
  const initialServiceTypeId = params.serviceTypeId || null;

  const { colors } = useTheme();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: vehicle } = useVehicle(vehicleId);
  const { data: serviceTypes } = useServiceTypes();
  const [isSeeding, setIsSeeding] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSeedDefaults = async () => {
    try {
      setIsSeeding(true);
      await restoreDefaultServiceTypes();
      queryClient.invalidateQueries();
    } finally {
      setIsSeeding(false);
    }
  };

  const [serviceTypeId, setServiceTypeId] = useState<string | null>(initialServiceTypeId);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [mileage, setMileage] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});
  const [checkedSuggestions, setCheckedSuggestions] = useState<string[]>([]);

  useEffect(() => {
    if (initialServiceTypeId && serviceTypes?.length) {
      setServiceTypeId(initialServiceTypeId);
    }
  }, [initialServiceTypeId, serviceTypes]);

  const selectedSt = (serviceTypes ?? []).find((st) => st.id === serviceTypeId);
  const suggestedTypes = selectedSt?.suggestions?.length
    ? (serviceTypes ?? []).filter((st) => selectedSt.suggestions.includes(st.id))
    : [];
  const resetTypes = selectedSt?.resets?.length
    ? (serviceTypes ?? []).filter((st) => selectedSt.resets.includes(st.id))
    : [];

  const addMutation = useAddMaintenanceLog();
  const { data: customFields } = useCustomFieldsForServiceType(serviceTypeId ?? undefined);

  const inputStyle = [styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }];

  const setToday = () => setDate(new Date().toISOString().slice(0, 10));
  const setYesterday = () => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    setDate(y.toISOString().slice(0, 10));
  };

  const toggleSuggestion = (id: string) => {
    setCheckedSuggestions((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
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

    try {
      setIsSaving(true);
      const cfv: CustomFieldValueCreate[] = Object.entries(fieldValues)
        .filter(([_, v]) => v != null && v.trim().length > 0)
        .map(([fieldId, value]) => ({ field_id: fieldId, value }));

      // 1. Add primary log
      await addMutation.mutateAsync({
        vehicleId: vehicleId!,
        data: {
          date: date.trim(),
          mileage: numMileage,
          cost: cost ? parseFloat(cost) || 0 : 0,
          notes: notes.trim() || null,
          service_type_id: serviceTypeId,
          custom_field_values: cfv,
        },
      });

      // 2. Add co-performed suggested logs
      if (checkedSuggestions.length > 0) {
        for (const sugId of checkedSuggestions) {
          await addMutation.mutateAsync({
            vehicleId: vehicleId!,
            data: {
              date: date.trim(),
              mileage: numMileage,
              cost: 0,
              notes: `Co-performed with ${selectedSt?.name ?? "service"}`,
              service_type_id: sugId,
              custom_field_values: [],
            },
          });
        }
      }

      router.back();
    } catch (e: any) {
      Alert.alert("Error Saving Log", e.message ?? "Could not save log entry.");
    } finally {
      setIsSaving(false);
    }
  };

  // Calculate current odometer for placeholder
  const latestLogMileage = vehicle?.maintenance_logs?.[0]?.mileage;
  const currentOdometer = latestLogMileage ?? vehicle?.initial_mileage;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      {/* Service Type Selector */}
      <Text style={[styles.label, { color: colors.text }]}>Service Category</Text>
      {(serviceTypes ?? []).length === 0 ? (
        <View style={[styles.emptyStBox, { borderColor: colors.border, backgroundColor: colors.card }]}>
          <Text style={{ color: (colors.text as string) + "88", fontSize: 13, marginBottom: 8 }}>
            No service types found.
          </Text>
          <TouchableOpacity
            style={[styles.seedQuickBtn, { backgroundColor: colors.primary }]}
            onPress={handleSeedDefaults}
            disabled={isSeeding}
          >
            <Text style={styles.seedQuickBtnText}>
              {isSeeding ? "Loading..." : "Load 25 Default Services"}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll}>
          {(serviceTypes ?? []).map((st) => (
            <TouchableOpacity
              key={st.id}
              style={[
                styles.chip,
                {
                  backgroundColor: serviceTypeId === st.id ? colors.primary : colors.card,
                  borderColor: serviceTypeId === st.id ? colors.primary : colors.border,
                },
              ]}
              onPress={() => {
                const nextId = serviceTypeId === st.id ? null : st.id;
                setServiceTypeId(nextId);
                setFieldValues({});
                setCheckedSuggestions([]);
              }}
              activeOpacity={0.7}
            >
              <Text style={{ color: serviceTypeId === st.id ? "#fff" : colors.text, fontSize: 13, fontWeight: "600" }}>
                {st.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Suggested Services Multi-select */}
      {suggestedTypes.length > 0 && (
        <View style={[styles.sugBox, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sugTitle, { color: colors.primary }]}>Co-performed Services</Text>
          <Text style={[styles.sugDesc, { color: (colors.text as string) + "88" }]}>
            Check to record simultaneous service entries at current date & mileage:
          </Text>
          <View style={styles.sugRow}>
            {suggestedTypes.map((sug) => {
              const isChecked = checkedSuggestions.includes(sug.id);
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
                    {isChecked ? "✓ " : "+ "}{sug.name}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      )}

      {/* Resets Notice */}
      {resetTypes.length > 0 && (
        <View style={[styles.resetNotice, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.resetNoticeTitle, { color: (colors.text as string) + "99" }]}>
            Resets countdown for: {resetTypes.map((r) => r.name).join(", ")}
          </Text>
        </View>
      )}

      {/* Date Input with Quick Pills */}
      <View style={styles.dateHeaderRow}>
        <Text style={[styles.label, { color: colors.text, marginTop: 0 }]}>Date (YYYY-MM-DD) *</Text>
        <View style={styles.quickDateRow}>
          <TouchableOpacity onPress={setToday} style={[styles.quickDatePill, { borderColor: colors.border }]}>
            <Text style={[styles.quickDateText, { color: colors.primary }]}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={setYesterday} style={[styles.quickDatePill, { borderColor: colors.border }]}>
            <Text style={[styles.quickDateText, { color: colors.text }]}>Yesterday</Text>
          </TouchableOpacity>
        </View>
      </View>
      <TextInput
        style={inputStyle}
        value={date}
        onChangeText={setDate}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={(colors.text as string) + "55"}
      />

      {/* Mileage Input */}
      <Text style={[styles.label, { color: colors.text }]}>Odometer Mileage (km) *</Text>
      <TextInput
        style={inputStyle}
        value={mileage}
        onChangeText={setMileage}
        keyboardType="numeric"
        placeholder={currentOdometer != null ? `e.g. ${currentOdometer} (current)` : "e.g. 55000"}
        placeholderTextColor={(colors.text as string) + "55"}
      />

      {/* Cost Input */}
      <Text style={[styles.label, { color: colors.text }]}>Total Cost ($)</Text>
      <TextInput
        style={inputStyle}
        value={cost}
        onChangeText={setCost}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor={(colors.text as string) + "55"}
      />

      {/* Notes Input */}
      <Text style={[styles.label, { color: colors.text }]}>Notes</Text>
      <TextInput
        style={[...inputStyle, styles.textArea]}
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={3}
        placeholder="Workshop, technician, parts replaced, observations..."
        placeholderTextColor={(colors.text as string) + "55"}
      />

      {/* Custom Fields */}
      {customFields && customFields.length > 0 && (
        <View style={styles.customFieldsSection}>
          <Text style={[styles.sectionHeader, { color: colors.primary }]}>Custom Category Fields</Text>
          {customFields.map((field) => {
            const currentValue = fieldValues[field.id] ?? "";
            return (
              <View key={field.id} style={styles.customFieldRow}>
                <Text style={[styles.label, { color: colors.text }]}>
                  {field.name}{field.unit ? ` (${field.unit})` : ""}
                </Text>

                {field.field_type === "boolean" ? (
                  <View style={styles.booleanRow}>
                    <TouchableOpacity
                      style={[
                        styles.booleanPill,
                        {
                          backgroundColor: currentValue === "true" ? colors.primary : colors.card,
                          borderColor: currentValue === "true" ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => setFieldValues((p) => ({ ...p, [field.id]: "true" }))}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={{
                          color: currentValue === "true" ? "#fff" : colors.text,
                          fontWeight: currentValue === "true" ? "700" : "500",
                          fontSize: 13,
                        }}
                      >
                        Yes
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[
                        styles.booleanPill,
                        {
                          backgroundColor: currentValue === "false" ? colors.primary : colors.card,
                          borderColor: currentValue === "false" ? colors.primary : colors.border,
                        },
                      ]}
                      onPress={() => setFieldValues((p) => ({ ...p, [field.id]: "false" }))}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={{
                          color: currentValue === "false" ? "#fff" : colors.text,
                          fontWeight: currentValue === "false" ? "700" : "500",
                          fontSize: 13,
                        }}
                      >
                        No
                      </Text>
                    </TouchableOpacity>
                    {currentValue !== "" && (
                      <TouchableOpacity
                        style={[styles.booleanPillClear, { borderColor: colors.border }]}
                        onPress={() => setFieldValues((p) => ({ ...p, [field.id]: "" }))}
                      >
                        <Text style={{ color: (colors.text as string) + "66", fontSize: 11 }}>Clear</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  <TextInput
                    style={inputStyle}
                    value={currentValue}
                    onChangeText={(v) => setFieldValues((prev) => ({ ...prev, [field.id]: v }))}
                    keyboardType={field.field_type === "number" ? "numeric" : "default"}
                    placeholder={`Enter ${field.name.toLowerCase()}${field.unit ? ` in ${field.unit}` : ""}`}
                    placeholderTextColor={(colors.text as string) + "55"}
                  />
                )}
              </View>
            );
          })}
        </View>
      )}

      {/* Action Button */}
      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: colors.primary }]}
        onPress={handleSave}
        disabled={isSaving}
        activeOpacity={0.8}
      >
        <Text style={styles.saveBtnText}>
          {isSaving ? "Saving Entry..." : checkedSuggestions.length > 0 ? `Save Log + (${checkedSuggestions.length}) Co-services` : "Save Maintenance Log"}
        </Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 50 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 16 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  textArea: { minHeight: 80, textAlignVertical: "top" },
  chipScroll: { flexDirection: "row", marginTop: 4, marginBottom: 8 },
  emptyStBox: { borderWidth: 1, borderRadius: 12, padding: 14, alignItems: "center" },
  seedQuickBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  seedQuickBtnText: { color: "#fff", fontWeight: "700", fontSize: 13 },
  sugBox: { borderWidth: 1, borderRadius: 12, padding: 14, marginTop: 12, marginBottom: 4 },
  sugTitle: { fontSize: 13, fontWeight: "700", marginBottom: 4 },
  sugDesc: { fontSize: 12, lineHeight: 16, marginBottom: 10 },
  sugRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  sugChip: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 7 },
  sugChipText: { fontSize: 12 },
  resetNotice: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginTop: 10 },
  resetNoticeTitle: { fontSize: 12, fontStyle: "italic" },
  dateHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 16, marginBottom: 6 },
  quickDateRow: { flexDirection: "row", gap: 6 },
  quickDatePill: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  quickDateText: { fontSize: 11, fontWeight: "600" },
  chip: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8 },
  customFieldsSection: { marginTop: 18 },
  customFieldRow: { marginBottom: 4 },
  booleanRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  booleanPill: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 18, paddingVertical: 9 },
  booleanPillClear: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  sectionHeader: { fontSize: 15, fontWeight: "700", marginTop: 12, marginBottom: 4 },
  saveBtn: { marginTop: 32, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
