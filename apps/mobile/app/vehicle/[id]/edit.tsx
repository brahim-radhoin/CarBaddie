import { StyleSheet, ScrollView, TextInput, TouchableOpacity, View, Alert, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter, useTheme } from "expo-router";
import { useVehicle, useUpdateVehicle, useDeleteVehicle } from "@/src/hooks/useDatabase";
import { Text } from "@/components/Themed";
import { useState, useEffect } from "react";

export default function EditVehicleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const { data: vehicle, isLoading: isLoadingVehicle } = useVehicle(id);
  const updateMutation = useUpdateVehicle();
  const deleteMutation = useDeleteVehicle();

  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [vin, setVin] = useState("");
  const [mileage, setMileage] = useState("");
  const [acquisitionDate, setAcquisitionDate] = useState("");

  useEffect(() => {
    if (vehicle) {
      setMake(vehicle.make);
      setModel(vehicle.model);
      setYear(vehicle.year ? String(vehicle.year) : "");
      setVin(vehicle.vin ?? "");
      setMileage(vehicle.initial_mileage ? String(vehicle.initial_mileage) : "");
      setAcquisitionDate(vehicle.acquisition_date ?? "");
    }
  }, [vehicle]);

  const inputStyle = [styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }];

  const setToday = () => setAcquisitionDate(new Date().toISOString().slice(0, 10));

  const handleSave = () => {
    if (!make.trim() || !model.trim()) {
      Alert.alert("Required", "Make and Model are required.");
      return;
    }
    updateMutation.mutate(
      {
        id: id!,
        data: {
          make: make.trim(),
          model: model.trim(),
          year: year ? Number(year) : undefined,
          vin: vin.trim() || null,
          initial_mileage: mileage ? Number(mileage) : undefined,
          acquisition_date: acquisitionDate.trim() || null,
        },
      },
      { onSuccess: () => router.back() }
    );
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete Vehicle",
      `Are you sure you want to delete ${make || "this vehicle"} ${model}? All logs and interval overrides will be permanently removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Vehicle",
          style: "destructive",
          onPress: () => {
            deleteMutation.mutate(id!, {
              onSuccess: () => {
                router.dismissAll();
                router.replace("/(tabs)");
              },
              onError: (err) => Alert.alert("Error", err.message || "Failed to delete vehicle."),
            });
          },
        },
      ]
    );
  };

  const isSaving = updateMutation.isPending;
  const isDeleting = deleteMutation.isPending;

  if (isLoadingVehicle) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.label, { color: colors.text }]}>Make *</Text>
      <TextInput style={inputStyle} value={make} onChangeText={setMake} />

      <Text style={[styles.label, { color: colors.text }]}>Model *</Text>
      <TextInput style={inputStyle} value={model} onChangeText={setModel} />

      <Text style={[styles.label, { color: colors.text }]}>Year</Text>
      <TextInput style={inputStyle} value={year} onChangeText={setYear} keyboardType="numeric" />

      <Text style={[styles.label, { color: colors.text }]}>VIN</Text>
      <TextInput style={inputStyle} value={vin} onChangeText={setVin} autoCapitalize="characters" />

      <Text style={[styles.label, { color: colors.text }]}>Initial Mileage (km)</Text>
      <TextInput style={inputStyle} value={mileage} onChangeText={setMileage} keyboardType="numeric" />

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
        placeholder="YYYY-MM-DD"
        placeholderTextColor={(colors.text as string) + "55"}
      />

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

      <View style={[styles.dangerSection, { borderTopColor: colors.border }]}>
        <Text style={styles.dangerTitle}>Danger Zone</Text>
        <TouchableOpacity
          style={styles.deleteBtn}
          onPress={handleDelete}
          disabled={isDeleting}
          activeOpacity={0.8}
        >
          {isDeleting ? (
            <ActivityIndicator color="#ef4444" size="small" />
          ) : (
            <Text style={styles.deleteBtnText}>Delete Vehicle</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, paddingBottom: 50 },
  label: { fontSize: 13, fontWeight: "700", marginBottom: 6, marginTop: 14, letterSpacing: 0.2 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  dateHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14, marginBottom: 6 },
  quickDatePill: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  quickDateText: { fontSize: 11, fontWeight: "600" },
  saveBtn: { marginTop: 28, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  saveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  dangerSection: { marginTop: 32, paddingTop: 20, borderTopWidth: 1 },
  dangerTitle: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", color: "#ef4444", marginBottom: 10 },
  deleteBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: "#ef444415" },
  deleteBtnText: { color: "#ef4444", fontSize: 14, fontWeight: "700" },
});
