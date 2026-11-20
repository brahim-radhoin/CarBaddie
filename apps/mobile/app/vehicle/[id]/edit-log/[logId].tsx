import { StyleSheet, TouchableOpacity, View, Alert, ActivityIndicator } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { DateField } from "@/components/DateField";
import { PickerField, serviceTypeOptions } from "@/components/PickerField";
import { CustomFieldInput } from "@/components/CustomFieldInput";
import { addDaysISO, todayISO } from "@/src/dates";
import { Redirect, useLocalSearchParams, useRouter } from "expo-router";
import { useTheme, type Palette } from "@/src/theme";
import {
  useMaintenanceLog,
  useUpdateMaintenanceLog,
  useDeleteMaintenanceLog,
  useServiceTypes,
  useCustomFieldsForServiceType,
  useVehicle,
} from "@/src/hooks/useDatabase";
import { Text, TextInput } from "@/components/Themed";
import { useState, useEffect, useMemo } from "react";
import type { CustomFieldValueCreate } from "@/src/types";
import { centsToInput, parseMoney, parseWholeNumber } from "@carbaddie/core";
import { useUnits } from "@/src/hooks/useUnits";
import { useHistoryChecks } from "@/src/hooks/useHistoryChecks";

export default function EditLogScreen() {
  const { id: vehicleId, logId } = useLocalSearchParams<{ id: string; logId: string }>();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();

  const { data: log, isLoading: isLoadingLog } = useMaintenanceLog(logId);
  const { data: serviceTypes } = useServiceTypes();
  const updateMutation = useUpdateMaintenanceLog();
  const deleteMutation = useDeleteMaintenanceLog();
  const units = useUnits();
  const { data: vehicle } = useVehicle(vehicleId);
  const checks = useHistoryChecks(vehicle, { logId });

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

  const setToday = () => setDate(todayISO());
  const setYesterday = () => setDate(addDaysISO(todayISO(), -1));

  const handleSave = () => {
    if (!date.trim() || !mileage.trim()) {
      Alert.alert("Required", "Date and mileage are required.");
      return;
    }
    const numMileage = parseWholeNumber(mileage);
    if (numMileage === null) {
      Alert.alert("Check the odometer", "Enter the odometer reading as a whole number, e.g. 55000.");
      return;
    }
    const costCents = parseMoney(cost);
    if (costCents === null) {
      Alert.alert("Invalid cost", "Enter the cost as an amount, e.g. 45.90");
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
          mileage: units.fromDisplay(numMileage, log?.mileage),
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
    Alert.alert("Delete maintenance log", "Are you sure you want to delete this log entry?", [
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
    <KeyboardAwareScrollView bottomOffset={24}
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      {/* Category selector */}
      <Text style={[styles.label, { color: colors.text }]}>Service type</Text>
      <PickerField
        title="Service type"
        placeholder="Select a service type"
        value={serviceTypeId}
        options={serviceTypeOptions(serviceTypes ?? [])}
        allowClear
        clearLabel="No service type"
        onChange={setServiceTypeId}
        style={styles.chipScroll}
      />

      {/* Resets Notice */}
      {resetTypes.length > 0 && (
        <View style={[styles.resetNotice, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.resetNoticeTitle, { color: colors.textSecondary }]}>
            Resets countdown for: {resetTypes.map((r) => r.name).join(", ")}
          </Text>
        </View>
      )}

      {/* Date Input with Quick Pills */}
      <View style={styles.dateHeaderRow}>
        <Text style={[styles.label, { color: colors.text, marginTop: 0 }]}>Date *</Text>
        <View style={styles.quickDateRow}>
          <TouchableOpacity accessibilityRole="button" onPress={setToday} style={[styles.quickDatePill, { borderColor: colors.border }]}>
            <Text style={[styles.quickDateText, { color: colors.primary }]}>Today</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" onPress={setYesterday} style={[styles.quickDatePill, { borderColor: colors.border }]}>
            <Text style={[styles.quickDateText, { color: colors.text }]}>Yesterday</Text>
          </TouchableOpacity>
        </View>
      </View>
      <DateField label="Log date" value={date} onChange={setDate} min={checks.minDate} max={checks.maxDate} />

      {/* Mileage Input */}
      <Text style={[styles.label, { color: colors.text }]}>Odometer ({units.unit}) *</Text>
      <TextInput
        style={inputStyle}
        value={mileage}
        onChangeText={setMileage}
        keyboardType="number-pad"
        placeholder="e.g. 55000"
        placeholderTextColor={colors.textMuted}
      />
      {(() => {
        const warning = checks.odometerWarning(date, mileage, log?.mileage);
        return warning ? <Text style={[styles.warning, { color: colors.warn }]}>{warning}</Text> : null;
      })()}

      {/* Cost Input */}
      <Text style={[styles.label, { color: colors.text }]}>Total cost ({units.currency})</Text>
      <TextInput
        style={inputStyle}
        value={cost}
        onChangeText={setCost}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor={colors.textMuted}
      />

      {/* Notes Input */}
      <Text style={[styles.label, { color: colors.text }]}>Notes</Text>
      <TextInput
        style={[...inputStyle, styles.textArea]}
        value={notes}
        onChangeText={setNotes}
        multiline
        numberOfLines={3}
        placeholder="Observations, parts replaced, technician"
        placeholderTextColor={colors.textMuted}
      />

      {/* Custom Fields */}
      {customFields && customFields.length > 0 && (
        <View style={styles.customFieldsSection}>
          <Text style={[styles.sectionHeader, { color: colors.primary }]}>Custom fields</Text>
          {customFields.map((field) => (
            <CustomFieldInput
              key={field.id}
              field={field}
              value={fieldValues[field.id] ?? ""}
              onChange={(v) => setFieldValues((prev) => ({ ...prev, [field.id]: v }))}
              inputStyle={inputStyle}
              pillBackground={colors.card}
            />
          ))}
        </View>
      )}

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
          <Text style={styles.saveBtnText}>Save changes</Text>
        )}
      </TouchableOpacity>

      {/* Delete Button */}
      <TouchableOpacity accessibilityRole="button"
        style={styles.deleteBtn}
        onPress={handleDelete}
        disabled={isDeleting}
        activeOpacity={0.8}
      >
        {isDeleting ? (
          <ActivityIndicator color={colors.danger} size="small" />
        ) : (
          <Text style={styles.deleteBtnText}>Delete log entry</Text>
        )}
      </TouchableOpacity>
    </KeyboardAwareScrollView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, paddingBottom: 50 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 14 },
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
    fontSize: 12,
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
    fontSize: 12,
    fontWeight: "600",
  },
  customFieldsSection: {
    marginTop: 18,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: "600",
  },
  warning: {
    fontSize: 12,
    marginTop: 6,
  },
  saveBtn: {
    marginTop: 30,
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
