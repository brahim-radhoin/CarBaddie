import { StyleSheet, TouchableOpacity, View, Alert, ActivityIndicator } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { formatISO } from "@/src/dates";
import { DateField } from "@/components/DateField";
import { useLocalSearchParams } from "expo-router";
import { useTheme, type Palette } from "@/src/theme";
import { ValidationError, parseWholeNumber, todayISO as localToday } from "@carbaddie/core";
import { useVehicle, useAddOdometerReading, useDeleteOdometerReading } from "@/src/hooks/useDatabase";
import { Text, TextInput } from "@/components/Themed";
import { useState, useMemo } from "react";
import { useUnits } from "@/src/hooks/useUnits";
import { useHistoryChecks } from "@/src/hooks/useHistoryChecks";

/** Add an odometer reading between services, and list / delete the vehicle's readings. */
export default function OdometerScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

  const styles = useMemo(() => makeStyles(colors), [colors]);
  const { data: vehicle } = useVehicle(id);
  const addMutation = useAddOdometerReading();
  const deleteMutation = useDeleteOdometerReading();
  const units = useUnits();
  const checks = useHistoryChecks(vehicle);

  const [date, setDate] = useState(() => localToday());
  const [mileage, setMileage] = useState("");
  const [note, setNote] = useState("");

  const inputStyle = [styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }];
  const muted = colors.textSecondary;

  if (!vehicle) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text, textAlign: "center", marginTop: 40 }}>Loading vehicle</Text>
      </View>
    );
  }

  const handleSave = () => {
    const typed = parseWholeNumber(mileage);
    if (typed === null) {
      Alert.alert("Check the odometer", `Enter the odometer in ${units.unit} as a whole number, e.g. 55000.`);
      return;
    }
    addMutation.mutate(
      { vehicleId: vehicle.id, data: { date: date.trim(), mileage: units.fromDisplay(typed), note: note.trim() || null } },
      {
        onSuccess: () => {
          setMileage("");
          setNote("");
          setDate(localToday());
        },
        onError: (err) =>
          Alert.alert(
            "Error",
            err instanceof ValidationError ? Object.values(err.fieldErrors).flat().join("\n") : err.message || "Failed to save.",
          ),
      },
    );
  };

  const handleDelete = (readingId: string, label: string) => {
    Alert.alert("Delete reading", `Delete ${label}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => deleteMutation.mutate({ readingId, vehicleId: vehicle.id }),
      },
    ]);
  };

  return (
    <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <View style={[styles.currentCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Text style={[styles.currentLabel, { color: muted }]}>Current odometer</Text>
        <Text style={[styles.currentValue, { color: colors.text }]}>
          {vehicle.current_mileage != null ? units.distance(vehicle.current_mileage) : "Unknown"}
        </Text>
        <Text style={[styles.currentHint, { color: muted }]}>
          The highest of the starting odometer, service logs and readings.
        </Text>
      </View>

      <Text style={[styles.label, { color: colors.text }]}>Odometer ({units.unit}) *</Text>
      <TextInput
        style={inputStyle}
        value={mileage}
        onChangeText={setMileage}
        keyboardType="number-pad"
        placeholder={vehicle.current_mileage != null ? String(units.toDisplay(vehicle.current_mileage)) : "e.g. 55000"}
        placeholderTextColor={muted}
      />
      {(() => {
        const warning = checks.odometerWarning(date, mileage);
        return warning ? <Text style={[styles.warning, { color: colors.warn }]}>{warning}</Text> : null;
      })()}

      <Text style={[styles.label, { color: colors.text }]}>Date *</Text>
      <DateField label="Reading date" value={date} onChange={setDate} min={checks.minDate} max={checks.maxDate} />

      <Text style={[styles.label, { color: colors.text }]}>Note</Text>
      <TextInput style={inputStyle} value={note} onChangeText={setNote} placeholder="Optional" placeholderTextColor={muted} />

      <TouchableOpacity accessibilityRole="button"
        style={[styles.saveBtn, { backgroundColor: colors.primary }]}
        onPress={handleSave}
        disabled={addMutation.isPending}
        activeOpacity={0.8}
      >
        {addMutation.isPending ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.saveBtnText}>Save reading</Text>}
      </TouchableOpacity>

      <Text style={[styles.sectionTitle, { color: colors.text }]}>Readings ({vehicle.odometer_readings.length})</Text>
      {vehicle.odometer_readings.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.emptyText, { color: muted }]}>No odometer readings yet.</Text>
        </View>
      ) : (
        vehicle.odometer_readings.map((r) => (
          <View key={r.id} style={[styles.readingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={{ flex: 1 }}>
              <View style={styles.readingTop}>
                <Text style={[styles.readingMileage, { color: colors.text }]}>{units.distance(r.mileage)}</Text>
                <Text style={[styles.readingDate, { color: muted }]}>{formatISO(r.date)}</Text>
              </View>
              {r.note && (
                <Text style={[styles.readingNote, { color: muted }]} numberOfLines={2}>
                  {r.note}
                </Text>
              )}
            </View>
            <TouchableOpacity accessibilityRole="button"
              style={styles.deleteBtn}
              onPress={() => handleDelete(r.id, `${units.distance(r.mileage)} on ${formatISO(r.date)}`)}
              activeOpacity={0.7}
            >
              <Text style={styles.deleteBtnText}>Delete</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </KeyboardAwareScrollView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 50 },
  currentCard: { borderRadius: 16, borderWidth: 1, padding: 16, alignItems: "center" },
  currentLabel: { fontSize: 12, fontWeight: "600" },
  currentValue: { fontSize: 24, fontWeight: "600", marginTop: 4 },
  currentHint: { fontSize: 12, marginTop: 4, textAlign: "center" },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 16 },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  warning: { fontSize: 12, marginTop: 6 },
  saveBtn: { marginTop: 24, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  saveBtnText: { color: colors.onPrimary, fontSize: 16, fontWeight: "600" },
  sectionTitle: { fontSize: 15, fontWeight: "600", marginTop: 28, marginBottom: 10 },
  emptyCard: { borderRadius: 12, borderWidth: 1, padding: 20, alignItems: "center" },
  emptyText: { fontSize: 13 },
  readingCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 8, flexDirection: "row", alignItems: "center", gap: 10 },
  readingTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  readingMileage: { fontSize: 14, fontWeight: "600" },
  readingDate: { fontSize: 12 },
  readingNote: { fontSize: 12, marginTop: 4 },
  deleteBtn: { minHeight: 48, justifyContent: "center", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: colors.dangerBg, borderWidth: 1, borderColor: colors.border },
  deleteBtnText: { color: colors.danger, fontSize: 12, fontWeight: "600" },
});
