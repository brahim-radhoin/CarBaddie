import { StyleSheet, ScrollView, TextInput, TouchableOpacity, View, Alert, ActivityIndicator } from "react-native";
import { Redirect, useLocalSearchParams, useRouter, useTheme } from "expo-router";
import {
  useMaintenanceLog,
  useUpdateMaintenanceLog,
  useDeleteMaintenanceLog,
  useServiceTypes,
  useCustomFieldsForServiceType,
} from "@/src/hooks/useDatabase";
import { Text } from "@/components/Themed";
import { useState, useEffect } from "react";
import type { CustomFieldValueCreate } from "@/src/types";
import { centsToInput, parseMoney } from "@carbaddie/core";
import { useUnits } from "@/src/hooks/useUnits";

export default function EditLogScreen() {
  const { id: vehicleId, logId } = useLocalSearchParams<{ id: string; logId: string }>();
  const { colors } = useTheme();
  const router = useRouter();

  const { data: log, isLoading: isLoadingLog } = useMaintenanceLog(logId);
  const { data: serviceTypes } = useServiceTypes();
  const updateMutation = useUpdateMaintenanceLog();
  const deleteMutation = useDeleteMaintenanceLog();
  const units = useUnits();

  const [serviceTypeId, setServiceTypeId] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [mileage, setMileage] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [fieldValues, setFieldValues] = useState<Record<string, string>>({});

  const { data: customFields } = useCustomFieldsForServiceType(serviceTypeId ?? undefined);

  const selectedSt = (serviceTypes ?? []).find((st) => st.id === serviceTypeId);
  const resetTypes = selectedSt?.resets?.length
    ? (serviceTypes ?? []).filter((st) => selectedSt.resets.includes(st.id))
    : [];

  useEffect(() => {
    if (log) {
      setServiceTypeId(log.service_type_id ?? null);
      setDate(log.date);
      setMileage(String(units.toDisplay(log.mileage)));
      setCost(centsToInput(log.cost_cents));
      setNotes(log.notes ?? "");
      const fv: Record<string, string> = {};
      (log.custom_field_values || []).forEach((cfv) => {
        fv[cfv.field_id] = cfv.value;
      });
      setFieldValues(fv);
    }
  }, [log, units]);

  const inputStyle = [
    styles.input,
    { backgroundColor: colors.card, color: colors.text, borderColor: colors.border },
  ];

  const setToday = () => setDate(new Date().toISOString().slice(0, 10));
  const setYesterday = () => {
    const y = new Date();
    y.setDate(y.getDate() - 1);
    setDate(y.toISOString().slice(0, 10));
  };

  const handleSave = () => {
    if (!date.trim() || !mileage.trim()) {
      Alert.alert("Required", "Date and Mileage are required.");
      return;
    }
    const numMileage = parseInt(mileage, 10);
    if (isNaN(numMileage) || numMileage < 0) {
      Alert.alert("Invalid Mileage", "Please enter a valid mileage.");
      return;
    }
    const costCents = parseMoney(cost);
    if (costCents === null) {
      Alert.alert("Invalid Cost", "Enter the cost as an amount, e.g. 45.90");
      return;
    }

    const cfv: CustomFieldValueCreate[] = Object.entries(fieldValues)
      .filter(([_, v]) => v != null && v.trim().length > 0)
      .map(([fId, value]) => ({ field_id: fId, value }));

    updateMutation.mutate(
      {
        logId: logId!,
        data: {
          date: date.trim(),
          mileage: units.fromDisplay(numMileage),
          cost_cents: costCents,
          notes: notes.trim() || null,
          service_type_id: serviceTypeId,
          custom_field_values: cfv,
        },
      },
      {
        onSuccess: () => router.back(),
        onError: (err) => Alert.alert("Error", err.message || "Failed to update maintenance log."),
      }
    );
  };

  const handleDelete = () => {
    Alert.alert("Delete Maintenance Log", "Are you sure you want to delete this log entry?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteMutation.mutate(
            { logId: logId!, vehicleId: vehicleId! },
            {
              onSuccess: () => router.back(),
              onError: (err) => Alert.alert("Error", err.message || "Failed to delete log."),
            }
          );
        },
      },
    ]);
  };

  const isSaving = updateMutation.isPending;
  const isDeleting = deleteMutation.isPending;

  if (isLoadingLog) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  // A visit's item is edited with its visit.
  if (log?.event_id) {
    return <Redirect href={`/vehicle/${vehicleId}/edit-visit/${log.event_id}`} />;
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Category selector */}
      <Text style={[styles.label, { color: colors.text }]}>Service Category</Text>
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
              setServiceTypeId(serviceTypeId === st.id ? null : st.id);
            }}
            activeOpacity={0.7}
          >
            <Text
              style={{
                color: serviceTypeId === st.id ? "#fff" : colors.text,
                fontSize: 13,
                fontWeight: "600",
              }}
            >
              {st.name}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

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
      <Text style={[styles.label, { color: colors.text }]}>Odometer Mileage ({units.unit}) *</Text>
      <TextInput
        style={inputStyle}
        value={mileage}
        onChangeText={setMileage}
        keyboardType="numeric"
        placeholder="e.g. 55000"
        placeholderTextColor={(colors.text as string) + "55"}
      />

      {/* Cost Input */}
      <Text style={[styles.label, { color: colors.text }]}>Total Cost ({units.currency})</Text>
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
        placeholder="Observations, parts replaced, technician..."
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
                  {field.name}
                  {field.unit ? ` (${field.unit})` : ""}
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
          <Text style={styles.saveBtnText}>Save Changes</Text>
        )}
      </TouchableOpacity>

      {/* Delete Button */}
      <TouchableOpacity
        style={styles.deleteBtn}
        onPress={handleDelete}
        disabled={isDeleting}
        activeOpacity={0.8}
      >
        {isDeleting ? (
          <ActivityIndicator color="#ef4444" size="small" />
        ) : (
          <Text style={styles.deleteBtnText}>Delete Log Entry</Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, paddingBottom: 50 },
  label: { fontSize: 13, fontWeight: "700", marginBottom: 6, marginTop: 14, letterSpacing: 0.2 },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  textArea: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  chipScroll: {
    flexDirection: "row",
    marginTop: 4,
    marginBottom: 4,
  },
  chip: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginRight: 8,
  },
  resetNotice: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginTop: 10,
  },
  resetNoticeTitle: {
    fontSize: 11,
    fontWeight: "600",
  },
  dateHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 14,
    marginBottom: 6,
  },
  quickDateRow: {
    flexDirection: "row",
    gap: 6,
  },
  quickDatePill: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  quickDateText: {
    fontSize: 11,
    fontWeight: "600",
  },
  customFieldsSection: {
    marginTop: 18,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  customFieldRow: {
    marginBottom: 4,
  },
  booleanRow: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  booleanPill: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 18,
    paddingVertical: 9,
  },
  booleanPillClear: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  saveBtn: {
    marginTop: 30,
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
