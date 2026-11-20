import { StyleSheet, TouchableOpacity, View, Alert } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { DateField } from "@/components/DateField";
import { BodyTypePicker } from "@/components/BodyTypePicker";
import { guessBodyType, parseWholeNumber, todayISO, vehicleStartDate } from "@carbaddie/core";
import { useRouter } from "expo-router";
import { useTheme, type Palette } from "@/src/theme";
import { useAddVehicle } from "@/src/hooks/useDatabase";
import { Text, TextInput } from "@/components/Themed";
import { useState, useMemo } from "react";
import { useUnits } from "@/src/hooks/useUnits";

export default function AddVehicleScreen() {
  const { colors } = useTheme();

  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const addMutation = useAddVehicle();
  const units = useUnits();

  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [vin, setVin] = useState("");
  const [mileage, setMileage] = useState("");
  const [acquisitionDate, setAcquisitionDate] = useState("");
  // Until the user picks, the type follows the make (a Yamaha is a motorbike).
  const [pickedType, setPickedType] = useState<string | null>(null);
  const bodyType = pickedType ?? guessBodyType(make);

  const inputStyle = [styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }];

  const handleSave = () => {
    if (!make.trim() || !model.trim()) {
      Alert.alert("Required", "Make and Model are required.");
      return;
    }
    const typedYear = year.trim() ? parseWholeNumber(year) : null;
    if (year.trim() && typedYear === null) {
      Alert.alert("Check the year", "Enter the model year as four digits, e.g. 2020.");
      return;
    }
    const typedMileage = mileage.trim() ? parseWholeNumber(mileage) : null;
    if (mileage.trim() && typedMileage === null) {
      Alert.alert("Check the odometer", "Enter the initial mileage as a whole number, e.g. 50000.");
      return;
    }
    addMutation.mutate(
      {
        make: make.trim(),
        model: model.trim(),
        year: typedYear ?? undefined,
        vin: vin.trim() || null,
        initial_mileage: typedMileage != null ? units.fromDisplay(typedMileage) : undefined,
        acquisition_date: acquisitionDate.trim() || null,
        body_type: bodyType,
      },
      {
        onSuccess: () => router.back(),
        onError: (err) => Alert.alert("Could not add vehicle", err.message || "Could not add the vehicle."),
      }
    );
  };
  const typedYear = parseWholeNumber(year);

  return (
    <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.label, { color: colors.text }]}>Make *</Text>
      <TextInput style={inputStyle} value={make} onChangeText={setMake} placeholder="e.g. Toyota" placeholderTextColor={colors.textMuted} />

      <Text style={[styles.label, { color: colors.text }]}>Model *</Text>
      <TextInput style={inputStyle} value={model} onChangeText={setModel} placeholder="e.g. Corolla" placeholderTextColor={colors.textMuted} />

      <Text style={[styles.label, { color: colors.text }]}>Type</Text>
      <BodyTypePicker value={bodyType} onChange={setPickedType} />

      <Text style={[styles.label, { color: colors.text }]}>Year</Text>
      <TextInput style={inputStyle} value={year} onChangeText={setYear} placeholder="e.g. 2020" placeholderTextColor={colors.textMuted} keyboardType="number-pad" maxLength={4} />

      <Text style={[styles.label, { color: colors.text }]}>VIN</Text>
      <TextInput style={inputStyle} value={vin} onChangeText={setVin} placeholder="Optional VIN" placeholderTextColor={colors.textMuted} autoCapitalize="characters" />

      <Text style={[styles.label, { color: colors.text }]}>Initial mileage ({units.unit})</Text>
      <TextInput style={inputStyle} value={mileage} onChangeText={setMileage} placeholder="e.g. 50000" placeholderTextColor={colors.textMuted} keyboardType="number-pad" />

      <Text style={[styles.label, { color: colors.text }]}>Acquisition date</Text>
      <DateField
        label="Acquisition date"
        value={acquisitionDate}
        onChange={setAcquisitionDate}
        placeholder="Optional"
        allowClear
        min={vehicleStartDate(typedYear) ?? undefined}
        max={todayISO()}
      />

      <TouchableOpacity accessibilityRole="button"
        style={[styles.saveBtn, { backgroundColor: colors.primary }]}
        onPress={handleSave}
        disabled={addMutation.isPending}
        activeOpacity={0.8}
      >
        <Text style={styles.saveBtnText}>{addMutation.isPending ? "Saving" : "Add vehicle"}</Text>
      </TouchableOpacity>
    </KeyboardAwareScrollView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 14 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  dateHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14, marginBottom: 6 },
  quickDatePill: { minHeight: 40, justifyContent: "center", borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  quickDateText: { fontSize: 12, fontWeight: "600" },
  saveBtn: { marginTop: 28, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  saveBtnText: { color: colors.onPrimary, fontSize: 16, fontWeight: "600" },
});
