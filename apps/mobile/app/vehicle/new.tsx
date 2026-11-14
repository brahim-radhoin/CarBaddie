import { StyleSheet, ScrollView, TextInput, TouchableOpacity, View, Alert } from "react-native";
import { useRouter, useTheme } from "expo-router";
import { useAddVehicle } from "@/src/hooks/useDatabase";
import { Text } from "@/components/Themed";
import { useState } from "react";
import { useUnits } from "@/src/hooks/useUnits";

export default function AddVehicleScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const addMutation = useAddVehicle();
  const units = useUnits();

  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [vin, setVin] = useState("");
  const [mileage, setMileage] = useState("");
  const [acquisitionDate, setAcquisitionDate] = useState("");

  const inputStyle = [styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }];

  const setToday = () => setAcquisitionDate(new Date().toISOString().slice(0, 10));

  const handleSave = () => {
    if (!make.trim() || !model.trim()) {
      Alert.alert("Required", "Make and Model are required.");
      return;
    }
    addMutation.mutate(
      {
        make: make.trim(),
        model: model.trim(),
        year: year ? Number(year) : undefined,
        vin: vin.trim() || null,
        initial_mileage: mileage ? units.fromDisplay(Number(mileage)) : undefined,
        acquisition_date: acquisitionDate.trim() || null,
      },
      { onSuccess: () => router.back() }
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.label, { color: colors.text }]}>Make *</Text>
      <TextInput style={inputStyle} value={make} onChangeText={setMake} placeholder="e.g. Toyota" placeholderTextColor={(colors.text as string) + "55"} />

      <Text style={[styles.label, { color: colors.text }]}>Model *</Text>
      <TextInput style={inputStyle} value={model} onChangeText={setModel} placeholder="e.g. Corolla" placeholderTextColor={(colors.text as string) + "55"} />

      <Text style={[styles.label, { color: colors.text }]}>Year</Text>
      <TextInput style={inputStyle} value={year} onChangeText={setYear} placeholder="e.g. 2020" placeholderTextColor={(colors.text as string) + "55"} keyboardType="numeric" />

      <Text style={[styles.label, { color: colors.text }]}>VIN</Text>
      <TextInput style={inputStyle} value={vin} onChangeText={setVin} placeholder="Optional VIN" placeholderTextColor={(colors.text as string) + "55"} autoCapitalize="characters" />

      <Text style={[styles.label, { color: colors.text }]}>Initial Mileage ({units.unit})</Text>
      <TextInput style={inputStyle} value={mileage} onChangeText={setMileage} placeholder="e.g. 50000" placeholderTextColor={(colors.text as string) + "55"} keyboardType="numeric" />

      <View style={styles.dateHeaderRow}>
        <Text style={[styles.label, { color: colors.text, marginTop: 0 }]}>Acquisition Date (YYYY-MM-DD)</Text>
        <TouchableOpacity onPress={setToday} style={[styles.quickDatePill, { borderColor: colors.border }]}>
          <Text style={[styles.quickDateText, { color: colors.primary }]}>Today</Text>
        </TouchableOpacity>
      </View>
      <TextInput
        style={inputStyle}
        value={acquisitionDate}
        onChangeText={setAcquisitionDate}
        placeholder="e.g. 2023-05-15"
        placeholderTextColor={(colors.text as string) + "55"}
      />

      <TouchableOpacity
        style={[styles.saveBtn, { backgroundColor: colors.primary }]}
        onPress={handleSave}
        disabled={addMutation.isPending}
        activeOpacity={0.8}
      >
        <Text style={styles.saveBtnText}>{addMutation.isPending ? "Saving..." : "Add Vehicle"}</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  label: { fontSize: 13, fontWeight: "700", marginBottom: 6, marginTop: 14, letterSpacing: 0.2 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  dateHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14, marginBottom: 6 },
  quickDatePill: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  quickDateText: { fontSize: 11, fontWeight: "600" },
  saveBtn: { marginTop: 28, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
});
