import { StyleSheet, ScrollView, TextInput, TouchableOpacity, View, Alert, ActivityIndicator } from "react-native";
import { useLocalSearchParams, useRouter, useTheme } from "expo-router";
import { useVehicle, useServiceTypes, useUpsertIntervalOverride, useDeleteIntervalOverride, useDeleteVehicle } from "@/src/hooks/useDatabase";
import { Text } from "@/components/Themed";
import { useState, useEffect, useMemo } from "react";

export default function VehicleSettingsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const { data: vehicle, isLoading: isLoadingVehicle } = useVehicle(id);
  const { data: serviceTypes = [], isLoading: isLoadingTypes } = useServiceTypes();
  const upsertMutation = useUpsertIntervalOverride();
  const deleteMutation = useDeleteIntervalOverride();
  const deleteVehicleMutation = useDeleteVehicle();

  const [overrides, setOverrides] = useState<Record<number, { km: string; days: string }>>({});
  const [savedRowId, setSavedRowId] = useState<number | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (vehicle) {
      const ov: Record<number, { km: string; days: string }> = {};
      (vehicle.interval_overrides || []).forEach((o) => {
        ov[o.service_type_id] = {
          km: o.override_interval_km != null ? String(o.override_interval_km) : "",
          days: o.override_interval_days != null ? String(o.override_interval_days) : "",
        };
      });
      setOverrides(ov);
    }
  }, [vehicle]);

  const filteredTypes = useMemo(() => {
    if (!search.trim()) return serviceTypes;
    const q = search.toLowerCase();
    return serviceTypes.filter((st) => st.name.toLowerCase().includes(q));
  }, [serviceTypes, search]);

  const inputStyle = [
    styles.input,
    { backgroundColor: colors.card, color: colors.text, borderColor: colors.border },
  ];

  const handleSave = (serviceTypeId: number) => {
    const ov = overrides[serviceTypeId];
    if (!ov || (!ov.km.trim() && !ov.days.trim())) {
      handleReset(serviceTypeId);
      return;
    }

    const km = ov.km.trim() ? Number(ov.km) : undefined;
    const days = ov.days.trim() ? Number(ov.days) : undefined;

    if (km !== undefined && (isNaN(km) || km <= 0)) {
      Alert.alert("Invalid Interval", "Interval km must be a positive number.");
      return;
    }
    if (days !== undefined && (isNaN(days) || days <= 0)) {
      Alert.alert("Invalid Interval", "Interval days must be a positive number.");
      return;
    }

    upsertMutation.mutate(
      {
        vehicleId: Number(id),
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

  const handleReset = (serviceTypeId: number) => {
    deleteMutation.mutate(
      { vehicleId: Number(id), serviceTypeId },
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
      "Delete Vehicle",
      `Are you sure you want to delete ${vehicle?.make || "this vehicle"} ${vehicle?.model || ""}? All logs and interval overrides will be permanently removed.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete Vehicle",
          style: "destructive",
          onPress: () => {
            deleteVehicleMutation.mutate(Number(id), {
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
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={[styles.title, { color: colors.text }]}>Service Interval Overrides</Text>
      <Text style={[styles.desc, { color: (colors.text as string) + "88" }]}>
        Tailor service schedules specifically for this vehicle. Overrides replace global defaults in countdowns and health telemetry.
      </Text>

      {/* Search Input */}
      {serviceTypes.length > 5 && (
        <View style={styles.searchContainer}>
          <TextInput
            style={[styles.searchInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
            value={search}
            onChangeText={setSearch}
            placeholder="Search categories..."
            placeholderTextColor={(colors.text as string) + "55"}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")} style={styles.clearSearchBtn}>
              <Text style={{ color: (colors.text as string) + "88", fontSize: 13 }}>✕</Text>
            </TouchableOpacity>
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
                borderColor: hasActiveOverride ? (colors.primary as string) + "66" : colors.border,
              },
            ]}
          >
            <View style={styles.cardHeader}>
              <Text style={[styles.stName, { color: colors.text }]}>{st.name}</Text>
              <View
                style={[
                  styles.statusBadge,
                  {
                    backgroundColor: hasActiveOverride ? (colors.primary as string) + "20" : (colors.text as string) + "10",
                  },
                ]}
              >
                <Text
                  style={[
                    styles.statusBadgeText,
                    {
                      color: hasActiveOverride ? colors.primary : (colors.text as string) + "77",
                    },
                  ]}
                >
                  {hasActiveOverride ? "Custom Override" : "Using Default"}
                </Text>
              </View>
            </View>

            <Text style={[styles.stDefault, { color: (colors.text as string) + "77" }]}>
              Global: {st.recommended_interval_km ? `${st.recommended_interval_km.toLocaleString()} km` : "No km"} /{" "}
              {st.recommended_interval_days ? `${st.recommended_interval_days} days` : "No days"}
            </Text>

            <View style={styles.inputRow}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: (colors.text as string) + "88" }]}>Target km</Text>
                <TextInput
                  style={inputStyle}
                  value={ov.km}
                  onChangeText={(v) =>
                    setOverrides((p) => ({ ...p, [st.id]: { ...ov, km: v } }))
                  }
                  keyboardType="numeric"
                  placeholder="—"
                  placeholderTextColor={(colors.text as string) + "33"}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.inputLabel, { color: (colors.text as string) + "88" }]}>Target days</Text>
                <TextInput
                  style={inputStyle}
                  value={ov.days}
                  onChangeText={(v) =>
                    setOverrides((p) => ({ ...p, [st.id]: { ...ov, days: v } }))
                  }
                  keyboardType="numeric"
                  placeholder="—"
                  placeholderTextColor={(colors.text as string) + "33"}
                />
              </View>

              <TouchableOpacity
                style={[
                  styles.saveRowBtn,
                  {
                    backgroundColor: wasJustSaved ? "#10b981" : colors.primary,
                  },
                ]}
                onPress={() => handleSave(st.id)}
                disabled={isSavingThis || isDeletingThis}
                activeOpacity={0.8}
              >
                {isSavingThis ? (
                  <ActivityIndicator color="#fff" size="small" />
                ) : (
                  <Text style={styles.saveRowBtnText}>{wasJustSaved ? "Saved ✓" : "Save"}</Text>
                )}
              </TouchableOpacity>
            </View>

            {hasActiveOverride && (
              <TouchableOpacity
                style={styles.resetRowBtn}
                onPress={() => handleReset(st.id)}
                disabled={isDeletingThis}
                activeOpacity={0.7}
              >
                <Text style={styles.resetRowBtnText}>
                  {isDeletingThis ? "Resetting..." : "Reset to Global Default"}
                </Text>
              </TouchableOpacity>
            )}
          </View>
        );
      })}

      {/* Danger Zone */}
      <View style={[styles.dangerSection, { borderTopColor: colors.border }]}>
        <Text style={styles.dangerTitle}>Danger Zone</Text>
        <TouchableOpacity
          style={styles.deleteVehicleBtn}
          onPress={handleDeleteVehicle}
          disabled={deleteVehicleMutation.isPending}
          activeOpacity={0.8}
        >
          {deleteVehicleMutation.isPending ? (
            <ActivityIndicator color="#ef4444" size="small" />
          ) : (
            <Text style={styles.deleteVehicleBtnText}>Delete Vehicle</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingContainer: { flex: 1, alignItems: "center", justifyContent: "center" },
  content: { padding: 16, paddingBottom: 50 },
  title: { fontSize: 20, fontWeight: "800", marginBottom: 6, letterSpacing: -0.2 },
  desc: { fontSize: 13, marginBottom: 16, lineHeight: 18 },
  searchContainer: { marginBottom: 14, position: "relative" },
  searchInput: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, fontSize: 13 },
  clearSearchBtn: { position: "absolute", right: 12, top: 11 },
  card: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 12 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  stName: { fontSize: 15, fontWeight: "700", flex: 1 },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3, marginLeft: 8 },
  statusBadgeText: { fontSize: 11, fontWeight: "700" },
  stDefault: { fontSize: 12, marginTop: 4, marginBottom: 12 },
  inputRow: { flexDirection: "row", gap: 8, alignItems: "flex-end" },
  inputLabel: { fontSize: 11, marginBottom: 4, fontWeight: "600", textTransform: "uppercase" },
  input: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 },
  saveRowBtn: { borderRadius: 8, paddingHorizontal: 16, paddingVertical: 10, minWidth: 64, alignItems: "center", justifyContent: "center" },
  saveRowBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  resetRowBtn: { marginTop: 10, alignSelf: "flex-start", paddingVertical: 4 },
  resetRowBtnText: { color: "#ef4444", fontSize: 12, fontWeight: "600" },
  dangerSection: { marginTop: 32, paddingTop: 20, borderTopWidth: 1 },
  dangerTitle: { fontSize: 12, fontWeight: "700", textTransform: "uppercase", color: "#ef4444", marginBottom: 10 },
  deleteVehicleBtn: { borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: "#ef444415" },
  deleteVehicleBtnText: { color: "#ef4444", fontSize: 14, fontWeight: "700" },
});
