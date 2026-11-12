import { StyleSheet, FlatList, TouchableOpacity, View, TextInput } from "react-native";
import { useRouter, useTheme } from "expo-router";
import { useVehicles } from "@/src/hooks/useDatabase";
import { Text } from "@/components/Themed";
import { useState, useMemo } from "react";
import type { VehicleRead } from "@/src/types";

export default function VehicleListScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { data: vehicles = [], isLoading } = useVehicles();
  const [search, setSearch] = useState("");

  const filteredVehicles = useMemo(() => {
    if (!search.trim()) return vehicles;
    const q = search.toLowerCase();
    return vehicles.filter(
      (v) =>
        v.make.toLowerCase().includes(q) ||
        v.model.toLowerCase().includes(q) ||
        (v.vin && v.vin.toLowerCase().includes(q))
    );
  }, [vehicles, search]);

  const renderVehicle = ({ item }: { item: VehicleRead }) => {
    const lastLog = item.maintenance_logs?.[0];
    const totalCost = item.maintenance_logs?.reduce((sum, l) => sum + l.cost, 0) ?? 0;
    const logCount = item.maintenance_logs?.length ?? 0;
    const currentMileage = lastLog ? lastLog.mileage : item.initial_mileage;

    return (
      <TouchableOpacity
        style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => router.push(`/vehicle/${item.id}`)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleRow}>
            <Text style={[styles.cardMake, { color: colors.primary }]}>{item.make}</Text>
            <Text style={[styles.cardModel, { color: colors.text }]}>{item.model}</Text>
          </View>
          {item.year && <Text style={[styles.cardYear, { color: (colors.text as string) + "99" }]}>{item.year}</Text>}
        </View>

        {item.vin && (
          <Text style={[styles.vin, { color: (colors.text as string) + "77" }]}>
            VIN: {item.vin}
          </Text>
        )}

        <View style={[styles.statsRow, { borderTopColor: colors.border }]}>
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.text }]}>
              {currentMileage != null ? `${currentMileage.toLocaleString()} km` : "—"}
            </Text>
            <Text style={[styles.statLabel, { color: (colors.text as string) + "77" }]}>Odometer</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.text }]}>${totalCost.toFixed(0)}</Text>
            <Text style={[styles.statLabel, { color: (colors.text as string) + "77" }]}>Total Spent</Text>
          </View>
          <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
          <View style={styles.stat}>
            <Text style={[styles.statValue, { color: colors.text }]}>{logCount}</Text>
            <Text style={[styles.statLabel, { color: (colors.text as string) + "77" }]}>Logs</Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Search make, model, or VIN..."
          placeholderTextColor={(colors.text as string) + "55"}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} style={styles.clearSearchBtn}>
            <Text style={{ color: (colors.text as string) + "88", fontSize: 13 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredVehicles}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderVehicle}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          vehicles.length > 0 ? (
            <View style={styles.listHeader}>
              <Text style={[styles.fleetTitle, { color: (colors.text as string) + "88" }]}>
                {filteredVehicles.length} of {vehicles.length} vehicle{vehicles.length !== 1 ? "s" : ""}
              </Text>
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {search ? "No Matching Vehicles" : "No Vehicles Yet"}
              </Text>
              <Text style={[styles.emptySubtitle, { color: (colors.text as string) + "88" }]}>
                {search ? "Try a different search term." : "Tap the + button to add your first vehicle."}
              </Text>
            </View>
          ) : undefined
        }
      />
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => router.push("/vehicle/new")}
        activeOpacity={0.8}
      >
        <Text style={styles.fabText}>+</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  searchContainer: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, position: "relative" },
  searchInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  clearSearchBtn: { position: "absolute", right: 28, top: 22 },
  list: { padding: 16, paddingTop: 6, paddingBottom: 100 },
  listHeader: { marginBottom: 8, paddingHorizontal: 2 },
  fleetTitle: { fontSize: 12, fontWeight: "600" },
  card: { borderRadius: 16, borderWidth: 1, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  cardTitleRow: { flexDirection: "row", alignItems: "baseline", gap: 6 },
  cardMake: { fontSize: 16, fontWeight: "700" },
  cardModel: { fontSize: 16, fontWeight: "500" },
  cardYear: { fontSize: 13, fontWeight: "500" },
  vin: { fontSize: 11, fontFamily: "SpaceMono", marginBottom: 12 },
  statsRow: { flexDirection: "row", borderTopWidth: 1, marginTop: 12, paddingTop: 12 },
  stat: { flex: 1, alignItems: "center" },
  statValue: { fontSize: 14, fontWeight: "700" },
  statLabel: { fontSize: 11, marginTop: 2 },
  statDivider: { width: 1, height: "100%" },
  empty: { alignItems: "center", paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: "700", marginBottom: 6 },
  emptySubtitle: { fontSize: 13, textAlign: "center", paddingHorizontal: 40 },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: "center",
    alignItems: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  fabText: { color: "#fff", fontSize: 28, fontWeight: "600", marginTop: -2 },
});
