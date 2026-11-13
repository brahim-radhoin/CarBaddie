import { StyleSheet, FlatList, TouchableOpacity, View, TextInput, Alert } from "react-native";
import { useRouter, useTheme } from "expo-router";
import { useServiceTypes, useDeleteServiceType } from "@/src/hooks/useDatabase";
import { restoreDefaultServiceTypes } from "@/src/db/seed";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Text } from "@/components/Themed";
import type { ServiceTypeRead } from "@/src/types";

export default function ServiceTypesScreen() {
  const queryClient = useQueryClient();
  const [isSeeding, setIsSeeding] = useState(false);
  const [search, setSearch] = useState("");

  const handleSeedDefaults = async () => {
    try {
      setIsSeeding(true);
      const count = await restoreDefaultServiceTypes();
      queryClient.invalidateQueries();
      Alert.alert("Success", `Loaded ${count} default service types.`);
    } catch (e: any) {
      Alert.alert("Error", e.message ?? "Failed to seed default service types.");
    } finally {
      setIsSeeding(false);
    }
  };

  const { colors } = useTheme();
  const router = useRouter();
  const { data: serviceTypes = [], isLoading } = useServiceTypes();
  const deleteMutation = useDeleteServiceType();

  const filteredTypes = useMemo(() => {
    if (!search.trim()) return serviceTypes;
    const q = search.toLowerCase();
    return serviceTypes.filter((st) => st.name.toLowerCase().includes(q));
  }, [serviceTypes, search]);

  const handleDelete = (id: string, name: string) => {
    Alert.alert("Delete Service Type", `Delete "${name}"? Existing logs will keep their records.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(id) },
    ]);
  };

  const renderServiceType = ({ item }: { item: ServiceTypeRead }) => (
    <TouchableOpacity
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push(`/service-type/${item.id}/edit`)}
      onLongPress={() => handleDelete(item.id, item.name)}
      activeOpacity={0.7}
    >
      <View style={styles.cardTop}>
        <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
        <Text style={[styles.arrow, { color: (colors.text as string) + "44" }]}>›</Text>
      </View>

      <View style={styles.badgeRow}>
        {item.recommended_interval_km && (
          <View style={[styles.badge, { backgroundColor: (colors.primary as string) + "20" }]}>
            <Text style={[styles.badgeText, { color: colors.primary }]}>
              {item.recommended_interval_km.toLocaleString()} km
            </Text>
          </View>
        )}
        {item.recommended_interval_days && (
          <View style={[styles.badge, { backgroundColor: (colors.primary as string) + "20" }]}>
            <Text style={[styles.badgeText, { color: colors.primary }]}>
              {item.recommended_interval_days} days
            </Text>
          </View>
        )}
        {item.fields.length > 0 && (
          <View style={[styles.badge, { backgroundColor: (colors.text as string) + "10" }]}>
            <Text style={[styles.badgeText, { color: (colors.text as string) + "88" }]}>
              {item.fields.length} field{item.fields.length !== 1 ? "s" : ""}
            </Text>
          </View>
        )}
        {item.resets?.length > 0 && (
          <View style={[styles.badge, { backgroundColor: "#10b98115" }]}>
            <Text style={[styles.badgeText, { color: "#10b981" }]}>
              Resets ({item.resets.length})
            </Text>
          </View>
        )}
        {item.suggestions?.length > 0 && (
          <View style={[styles.badge, { backgroundColor: "#f59e0b15" }]}>
            <Text style={[styles.badgeText, { color: "#f59e0b" }]}>
              Suggestions ({item.suggestions.length})
            </Text>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Search Header */}
      <View style={styles.searchContainer}>
        <TextInput
          style={[styles.searchInput, { backgroundColor: colors.card, color: colors.text, borderColor: colors.border }]}
          value={search}
          onChangeText={setSearch}
          placeholder="Filter categories..."
          placeholderTextColor={(colors.text as string) + "55"}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch("")} style={styles.clearSearchBtn}>
            <Text style={{ color: (colors.text as string) + "88", fontSize: 13 }}>✕</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filteredTypes}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderServiceType}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          serviceTypes.length > 0 ? (
            <View style={styles.listHeader}>
              <Text style={[styles.countText, { color: (colors.text as string) + "88" }]}>
                {filteredTypes.length} of {serviceTypes.length} categories
              </Text>
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {search ? "No Categories Found" : "No Service Types"}
              </Text>
              <Text style={[styles.emptySubtitle, { color: (colors.text as string) + "88" }]}>
                {search
                  ? "Try searching for a different service name."
                  : "Create custom service types or load the 25 standard automotive categories."}
              </Text>
              {!search && (
                <TouchableOpacity
                  style={[styles.seedBtn, { backgroundColor: colors.primary }]}
                  onPress={handleSeedDefaults}
                  disabled={isSeeding}
                  activeOpacity={0.8}
                >
                  <Text style={styles.seedBtnText}>
                    {isSeeding ? "Loading..." : "Load 25 Default Services"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : undefined
        }
      />
      <TouchableOpacity
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => router.push("/service-type/new")}
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
  list: { padding: 16, paddingTop: 6, paddingBottom: 90 },
  listHeader: { marginBottom: 8, paddingHorizontal: 2 },
  countText: { fontSize: 12, fontWeight: "600" },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 10 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 16, fontWeight: "600" },
  arrow: { fontSize: 20 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11, fontWeight: "600" },
  fab: {
    position: "absolute",
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 4,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  fabText: { color: "#fff", fontSize: 28, fontWeight: "300", marginTop: -2 },
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: "700", marginBottom: 6 },
  emptySubtitle: { fontSize: 13, textAlign: "center", maxWidth: 280 },
  seedBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  seedBtnText: { color: "#fff", fontWeight: "700", fontSize: 14 },
});
