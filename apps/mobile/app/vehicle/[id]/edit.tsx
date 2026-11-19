import { StyleSheet, TextInput, TouchableOpacity, View, Alert, ActivityIndicator } from "react-native";
import { KeyboardAwareScrollView } from "react-native-keyboard-controller";
import { DateField } from "@/components/DateField";
import { BodyTypePicker } from "@/components/BodyTypePicker";
import { Switch } from "react-native";
import { drawableBodyType, splitGarage } from "@carbaddie/core";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme, type Palette } from "@/src/theme";
import { useVehicle, useVehicles, useUpdateVehicle, useDeleteVehicle } from "@/src/hooks/useDatabase";
import { Text } from "@/components/Themed";
import { useState, useEffect, useMemo } from "react";
import { useUnits } from "@/src/hooks/useUnits";

export default function EditVehicleScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { data: vehicle, isLoading: isLoadingVehicle } = useVehicle(id);
  const updateMutation = useUpdateVehicle();
  const deleteMutation = useDeleteVehicle();
  const units = useUnits();

  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [year, setYear] = useState("");
  const [vin, setVin] = useState("");
  const [mileage, setMileage] = useState("");
  const [acquisitionDate, setAcquisitionDate] = useState("");
  // Only what the user changes is sent, so a type this app can't draw (from a newer app) is kept.
  const [pickedType, setPickedType] = useState<string | null>(null);
  const [pickedFavourite, setPickedFavourite] = useState<boolean | null>(null);
  const { data: allVehicles = [] } = useVehicles();
  const onDeck = splitGarage(allVehicles).deck.some((v) => v.id === id);
  const favourite = pickedFavourite ?? onDeck;
  const bodyType = pickedType ?? (vehicle ? drawableBodyType(vehicle.body_type, vehicle.make) : "car");

  useEffect(() => {
    if (vehicle) {
      setMake(vehicle.make);
      setModel(vehicle.model);
      setYear(vehicle.year ? String(vehicle.year) : "");
      setVin(vehicle.vin ?? "");
      setMileage(vehicle.initial_mileage != null ? String(units.toDisplay(vehicle.initial_mileage)) : "");
      setAcquisitionDate(vehicle.acquisition_date ?? "");
    }
  }, [vehicle, units]);

  const inputStyle = [styles.input, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }];

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
          initial_mileage: mileage ? units.fromDisplay(Number(mileage), vehicle?.initial_mileage) : undefined,
          acquisition_date: acquisitionDate.trim() || null,
          ...(pickedType !== null ? { body_type: pickedType } : {}),
          ...(pickedFavourite !== null ? { is_favorite: pickedFavourite } : {}),
        },
      },
      { onSuccess: () => router.back() }
    );
  };

  const handleDelete = () => {
    Alert.alert(
      "Delete vehicle",
      `Are you sure you want to delete ${make || "this vehicle"} ${model}? All logs and interval overrides will be permanently removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete vehicle",
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
    <KeyboardAwareScrollView bottomOffset={24} keyboardShouldPersistTaps="handled" style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      <Text style={[styles.label, { color: colors.text }]}>Make *</Text>
      <TextInput style={inputStyle} value={make} onChangeText={setMake} />

      <Text style={[styles.label, { color: colors.text }]}>Model *</Text>
      <TextInput style={inputStyle} value={model} onChangeText={setModel} />

      <Text style={[styles.label, { color: colors.text }]}>Type</Text>
      <BodyTypePicker value={bodyType} onChange={setPickedType} />

      <View style={styles.favouriteRow}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.label, { color: colors.text, marginTop: 0, marginBottom: 2 }]}>Show on the garage deck</Text>
          <Text style={{ color: colors.textMuted, fontSize: 12 }}>Favourites are the big cards on the home screen</Text>
        </View>
        <Switch value={favourite} onValueChange={setPickedFavourite} trackColor={{ false: colors.textMuted, true: colors.accent }} thumbColor="#ffffff" accessibilityLabel="Show on the garage deck" />
      </View>

      <Text style={[styles.label, { color: colors.text }]}>Year</Text>
      <TextInput style={inputStyle} value={year} onChangeText={setYear} keyboardType="numeric" />

      <Text style={[styles.label, { color: colors.text }]}>VIN</Text>
      <TextInput style={inputStyle} value={vin} onChangeText={setVin} autoCapitalize="characters" />

      <Text style={[styles.label, { color: colors.text }]}>Initial mileage ({units.unit})</Text>
      <TextInput style={inputStyle} value={mileage} onChangeText={setMileage} keyboardType="numeric" />

      <Text style={[styles.label, { color: colors.text }]}>Acquisition date</Text>
      <DateField label="Acquisition date" value={acquisitionDate} onChange={setAcquisitionDate} placeholder="Optional" allowClear />

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

      <View style={[styles.dangerSection, { borderTopColor: colors.border }]}>
        <Text style={styles.dangerTitle}>Danger zone</Text>
        <TouchableOpacity accessibilityRole="button"
          style={styles.deleteBtn}
          onPress={handleDelete}
          disabled={isDeleting}
          activeOpacity={0.8}
        >
          {isDeleting ? (
            <ActivityIndicator color={colors.danger} size="small" />
          ) : (
            <Text style={styles.deleteBtnText}>Delete vehicle</Text>
          )}
        </TouchableOpacity>
      </View>
    </KeyboardAwareScrollView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 20, paddingBottom: 50 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 14 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
  dateHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginTop: 14, marginBottom: 6 },
  quickDatePill: { minHeight: 40, justifyContent: "center", borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  quickDateText: { fontSize: 12, fontWeight: "600" },
  favouriteRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 18 },
  saveBtn: { marginTop: 28, borderRadius: 12, paddingVertical: 16, alignItems: "center" },
  saveBtnText: { color: colors.onPrimary, fontSize: 16, fontWeight: "600" },
  dangerSection: { marginTop: 32, paddingTop: 20, borderTopWidth: 1 },
  dangerTitle: { fontSize: 12, fontWeight: "600", color: colors.danger, marginBottom: 10 },
  deleteBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: colors.dangerBg },
  deleteBtnText: { color: colors.danger, fontSize: 14, fontWeight: "600" },
});
