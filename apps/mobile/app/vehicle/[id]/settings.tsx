import { StyleSheet, ScrollView, TextInput, TouchableOpacity, View, Alert, ActivityIndicator } from "react-native";
import { IconButton, Icon } from "@/components/Controls";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme, type Palette } from "@/src/theme";
import { useVehicle, useServiceTypes, useUpsertIntervalOverride, useDeleteIntervalOverride, useDeleteVehicle } from "@/src/hooks/useDatabase";
import { Text } from "@/components/Themed";
import { useState, useEffect, useMemo } from "react";
import { useUnits } from "@/src/hooks/useUnits";

export default function VehicleSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { data: vehicle, isLoading: isLoadingVehicle } = useVehicle(id);
  const { data: serviceTypes = [], isLoading: isLoadingTypes } = useServiceTypes();
  const upsertMutation = useUpsertIntervalOverride();
  const deleteMutation = useDeleteIntervalOverride();
  const deleteVehicleMutation = useDeleteVehicle();
  const units = useUnits();

  const [overrides, setOverrides] = useState<Record<string, { km: string; days: string }>>({});
  const [savedRowId, setSavedRowId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (vehicle) {
      const ov: Record<string, { km: string; days: string }> = {};
      (vehicle.interval_overrides || []).forEach((o) => {
        ov[o.service_type_id] = {
          km: o.override_interval_km != null ? String(units.toDisplay(o.override_interval_km)) : "",
          days: o.override_interval_days != null ? String(o.override_interval_days) : "",
        };
      });
      setOverrides(ov);
    }
  }, [vehicle, units]);

  const filteredTypes = useMemo(() => {
    if (!search.trim()) return serviceTypes;
    const q = search.toLowerCase();
    return serviceTypes.filter((st) => st.name.toLowerCase().includes(q));
  }, [serviceTypes, search]);

  const inputStyle = [
    styles.input,
    { backgroundColor: colors.card, color: colors.text, borderColor: colors.border },
  ];

  const handleSave = (serviceTypeId: string) => {
    const ov = overrides[serviceTypeId];
    if (!ov || (!ov.km.trim() && !ov.days.trim())) {
      handleReset(serviceTypeId);
      return;
    }

    const typedKm = ov.km.trim() ? Number(ov.km) : undefined;
    const days = ov.days.trim() ? Number(ov.days) : undefined;

    if (typedKm !== undefined && (isNaN(typedKm) || typedKm <= 0)) {
      Alert.alert("Invalid interval", `Interval ${units.unit} must be a positive number.`);
      return;
    }
    const previousKm = vehicle?.interval_overrides.find((o) => o.service_type_id === serviceTypeId)?.override_interval_km;
    const km = typedKm !== undefined ? units.fromDisplay(typedKm, previousKm) : undefined;
    if (days !== undefined && (isNaN(days) || days <= 0)) {
      Alert.alert("Invalid interval", "Interval days must be a positive number.");
      return;
    }

    upsertMutation.mutate(
      {
        vehicleId: id!,
        serviceTypeId,
        data: { override_interval_km: km, override_interval_days: days },
      },
      {
        onSuccess: () => {
          setSavedRowId(serviceTypeId);
          setTimeout(() => setSavedRowId(null), 1800);
        },
        onError: (err) => Alert.alert("Error", err.message || "Failed to save override."),
      }
    );
  };

  const handleReset = (serviceTypeId: string) => {
    deleteMutation.mutate(
      { vehicleId: id!, serviceTypeId },
      {
        onSuccess: () => {
          setOverrides((prev) => ({
            ...prev,
            [serviceTypeId]: { km: "", days: "" },
          }));
        },
        onError: (err) => Alert.alert("Error", err.message || "Failed to reset override."),
      }
    );
  };

  const handleDeleteVehicle = () => {
    Alert.alert(
      "Delete vehicle",
      `Are you sure you want to delete ${vehicle?.make || "this vehicle"} ${vehicle?.model || ""}? All logs and interval overrides will be permanently removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete vehicle",
          style: "destructive",
          onPress: () => {
            deleteVehicleMutation.mutate(id!, {
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

  if (isLoadingVehicle || isLoadingTypes) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const existingOverrideIds = new Set(
    (vehicle?.interval_overrides || []).map((o) => o.service_type_id)
  );

  return (
    <ScrollView automaticallyAdjustKeyboardInsets
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: colors.text }]}>Service interval overrides</Text>
      <Text style={[styles.desc, { color: colors.textSecondary }]}>
        Tailor service schedules specifically for this vehicle. Overrides replace global defaults in countdowns and health telemetry.
      </Text>

      {/* Search Input */}
      {serviceTypes.length > 5 && (
        <View style={styles.searchContainer}>
          <TextInput
            style={[styles.searchInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search"
            placeholderTextColor={colors.textMuted}
          />
          {search.length > 0 && (
            <IconButton name="close" label="Clear search" onPress={() => setSearch("")} style={styles.clearSearchBtn} />
          )}
        </View>
      )}

      {filteredTypes.map((st) => {
        const ov = overrides[st.id] ?? { km: "", days: "" };
        const hasActiveOverride = existingOverrideIds.has(st.id);
        const isSavingThis = upsertMutation.isPending && upsertMutation.variables?.serviceTypeId === st.id;
        const isDeletingThis = deleteMutation.isPending && deleteMutation.variables?.serviceTypeId === st.id;
        const wasJustSaved = savedRowId === st.id;

        return (
          <View
            key={st.id}
            style={[
              styles.card,
              {
                backgroundColor: colors.card,
                borderColor: hasActiveOverride ? colors.accent : colors.border,
              },
            ]}
          >
            <View style={styles.cardHeader}>
              <Text style={[styles.stName, { color: colors.text }]}>{st.name}</Text>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: hasActiveOverride ? colors.raised : colors.raised,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    {
                      color: hasActiveOverride ? colors.primary : colors.textMuted,
                    },
                  ]}
                >
                  {hasActiveOverride ? "Custom override" : "Using default"}
                </Text>
              </View>
            </View>

            <Text style={[styles.stDefault, { color: colors.textMuted }]}>
              Global: {st.recommended_interval_km ? units.distance(st.recommended_interval_km) : `No ${units.unit}`} /{" "}
              {st.recommended_interval_days ? `${st.recommended_interval_days} days` : "No days"}
            </Text>

            <View style={styles.inputRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Target {units.unit}</Text>
                <TextInput
                  style={inputStyle}
                  value={ov.km}
                  onChangeText={(v) =>
                    setOverrides((p) => ({ ...p, [st.id]: { ...ov, km: v } }))
                  }
                  keyboardType="numeric"
                  placeholder="—"
                  placeholderTextColor={colors.textMuted}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: colors.textSecondary }]}>Target days</Text>
                <TextInput
                  style={inputStyle}
                  value={ov.days}
                  onChangeText={(v) =>
                    setOverrides((p) => ({ ...p, [st.id]: { ...ov, days: v } }))
                  }
                  keyboardType="numeric"
                  placeholder="—"
                  placeholderTextColor={colors.textMuted}
                />
              </View>

              <TouchableOpacity accessibilityRole="button"
                style={[
                  styles.saveRowBtn,
                  {
                    backgroundColor: wasJustSaved ? colors.ok : colors.primary,
                  },
                ]}
                onPress={() => handleSave(st.id)}
                disabled={isSavingThis || isDeletingThis}
                activeOpacity={0.8}
              >
                {isSavingThis ? (
                  <ActivityIndicator color={colors.onPrimary} size="small" />
                ) : (
                  <Text style={styles.saveRowBtnText}>{wasJustSaved ? "Saved" : "Save"}</Text>
                )}
              </TouchableOpacity>
            </View>

            {hasActiveOverride && (
              <TouchableOpacity accessibilityRole="button"
                style={styles.resetRowBtn}
                onPress={() => handleReset(st.id)}
                disabled={isDeletingThis}
                activeOpacity={0.7}
              >
                <Text style={styles.resetRowBtnText}>
                  {isDeletingThis ? "Resetting" : "Reset to global default"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      {/* Danger Zone */}
      <View style={[styles.dangerSection, { borderTopColor: colors.border }]}>
        <Text style={styles.dangerTitle}>Danger zone</Text>
        <TouchableOpacity accessibilityRole="button"
          style={styles.deleteVehicleBtn}
          onPress={handleDeleteVehicle}
          disabled={deleteVehicleMutation.isPending}
          activeOpacity={0.8}
        >
          {deleteVehicleMutation.isPending ? (
            <ActivityIndicator color={colors.danger} size="small" />
          ) : (
            <Text style={styles.deleteVehicleBtnText}>Delete vehicle</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, paddingBottom: 50 },
  title: { fontSize: 20, fontWeight: "600", marginBottom: 6, letterSpacing: -0.2 },
  desc: { fontSize: 13, marginBottom: 16, lineHeight: 18 },
  searchContainer: { marginBottom: 14, position: "relative" },
  searchInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13 },
  clearSearchBtn: { position: "absolute", right: 16, top: 14 },
  card: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stName: { fontSize: 15, fontWeight: "600", flex: 1 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  statusBadgeText: { fontSize: 12, fontWeight: "600" },
  stDefault: { fontSize: 12, marginTop: 4, marginBottom: 12 },
  inputRow: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  inputLabel: { fontSize: 12, marginBottom: 4, fontWeight: "600" },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  saveRowBtn: { minHeight: 48, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, minWidth: 64, alignItems: "center", justifyContent: "center" },
  saveRowBtnText: { color: colors.onPrimary, fontSize: 13, fontWeight: "600" },
  resetRowBtn: { minHeight: 48, justifyContent: "center", marginTop: 10, alignSelf: "flex-start", paddingVertical: 4 },
  resetRowBtnText: { color: colors.danger, fontSize: 12, fontWeight: "600" },
  dangerSection: { marginTop: 32, paddingTop: 20, borderTopWidth: 1 },
  dangerTitle: { fontSize: 12, fontWeight: "600", color: colors.danger, marginBottom: 10 },
  deleteVehicleBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: colors.dangerBg },
  deleteVehicleBtnText: { color: colors.danger, fontSize: 14, fontWeight: "600" },
});
