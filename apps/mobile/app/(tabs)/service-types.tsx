import { StyleSheet, SectionList, TouchableOpacity, View, Alert } from "react-native";
import { groupServiceTypes } from "@carbaddie/core";
import { IconButton, Icon } from "@/components/Controls";
import { useRouter } from "expo-router";
import { useTheme, type Palette } from "@/src/theme";
import { useServiceTypes, useDeleteServiceType } from "@/src/hooks/useDatabase";
import { restoreDefaultServiceTypes } from "@/src/db/seed";
import { useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Text, TextInput } from "@/components/Themed";
import type { ServiceTypeRead } from "@/src/types";
import { useUnits } from "@/src/hooks/useUnits";

export default function ServiceTypesScreen() {
  const queryClient = useQueryClient();
  const [isSeeding, setIsSeeding] = useState(false);
  const [search, setSearch] = useState("");
  const units = useUnits();

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


  const styles = useMemo(() => makeStyles(colors), [colors]);
  const router = useRouter();
  const { data: serviceTypes = [], isLoading } = useServiceTypes();
  const deleteMutation = useDeleteServiceType();

  const filteredTypes = useMemo(() => {
    if (!search.trim()) return serviceTypes;
    const q = search.toLowerCase();
    return serviceTypes.filter((st) => st.name.toLowerCase().includes(q));
  }, [serviceTypes, search]);
  // Grouped by the part of the vehicle they belong to, the parts the garage outline shows.
  const sections = useMemo(
    () => groupServiceTypes(filteredTypes).map((g) => ({ key: g.zone, title: g.label, data: g.types })),
    [filteredTypes]
  );

  const handleDelete = (id: string, name: string) => {
    Alert.alert("Delete service type", `Delete "${name}"? Existing logs will keep their records.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(id) },
    ]);
  };

  const renderServiceType = ({ item }: { item: ServiceTypeRead }) => (
    <TouchableOpacity accessibilityRole="button"
      style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={() => router.push(`/service-type/${item.id}/edit`)}
      onLongPress={() => handleDelete(item.id, item.name)}
      activeOpacity={0.7}
    >
      <View style={styles.cardTop}>
        <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
        <Icon name="chevron" color={colors.textMuted} size={16} />
      </View>

      <View style={styles.badgeRow}>
        {item.recommended_interval_km && (
          <View style={[styles.badge, { backgroundColor: colors.raised }]}>
            <Text style={[styles.badgeText, { color: colors.primary }]}>
              {units.distance(item.recommended_interval_km)}
            </Text>
          </View>
        )}
        {item.recommended_interval_days && (
          <View style={[styles.badge, { backgroundColor: colors.raised }]}>
            <Text style={[styles.badgeText, { color: colors.primary }]}>
              {item.recommended_interval_days} days
            </Text>
          </View>
        )}
        {item.fields.length > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.raised }]}>
            <Text style={[styles.badgeText, { color: colors.textSecondary }]}>
              {item.fields.length} field{item.fields.length !== 1 ? "s" : ""}
            </Text>
          </View>
        )}
        {item.resets?.length > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.okBg }]}>
            <Text style={[styles.badgeText, { color: colors.ok }]}>
              Resets ({item.resets.length})
            </Text>
          </View>
        )}
        {item.suggestions?.length > 0 && (
          <View style={[styles.badge, { backgroundColor: colors.warnBg }]}>
            <Text style={[styles.badgeText, { color: colors.warn }]}>
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
          placeholder="Filter"
          placeholderTextColor={colors.textMuted}
        />
        {search.length > 0 && (
          <IconButton name="close" label="Clear search" onPress={() => setSearch("")} style={styles.clearSearchBtn} />
        )}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderServiceType}
        renderSectionHeader={({ section }) => (
          <View style={[styles.sectionHeader, { backgroundColor: colors.background }]} accessibilityRole="header">
            <Text style={[styles.sectionTitle, { color: colors.text }]}>{section.title}</Text>
            <Text style={[styles.sectionCount, { color: colors.textMuted }]}>{section.data.length}</Text>
          </View>
        )}
        stickySectionHeadersEnabled
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          serviceTypes.length > 0 ? (
            <View style={styles.listHeader}>
              <Text style={[styles.countText, { color: colors.textSecondary }]}>
                {filteredTypes.length} of {serviceTypes.length} service types
              </Text>
            </View>
          ) : undefined
        }
        ListEmptyComponent={
          !isLoading ? (
            <View style={styles.empty}>
              <Text style={[styles.emptyTitle, { color: colors.text }]}>
                {search ? "No service types found" : "No service types"}
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
                {search
                  ? "Try searching for a different service name."
                  : "Create custom service types or load the 25 standard automotive service types."}
              </Text>
              {!search && (
                <TouchableOpacity accessibilityRole="button"
                  style={[styles.seedBtn, { backgroundColor: colors.primary }]}
                  onPress={handleSeedDefaults}
                  disabled={isSeeding}
                  activeOpacity={0.8}
                >
                  <Text style={styles.seedBtnText}>
                    {isSeeding ? "Loading" : "Load 25 default services"}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          ) : undefined
        }
      />
      <TouchableOpacity accessibilityRole="button" accessibilityLabel="Add service type"
        style={[styles.fab, { backgroundColor: colors.primary }]}
        onPress={() => router.push("/service-type/new")}
        activeOpacity={0.8}
      >
        <Icon name="add" color={colors.onPrimary} size={24} />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: { flex: 1 },
  searchContainer: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6, position: "relative" },
  searchInput: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, fontSize: 14 },
  clearSearchBtn: { position: "absolute", right: 16, top: 14 },
  list: { padding: 16, paddingTop: 6, paddingBottom: 90 },
  listHeader: { marginBottom: 8, paddingHorizontal: 2 },
  countText: { fontSize: 12, fontWeight: "600" },
  sectionHeader: { flexDirection: "row", alignItems: "baseline", gap: 8, paddingTop: 14, paddingBottom: 8, paddingHorizontal: 2 },
  sectionTitle: { fontSize: 14, fontWeight: "600" },
  sectionCount: { fontSize: 12 },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, marginBottom: 10 },
  cardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { fontSize: 16, fontWeight: "600" },
  arrow: { fontSize: 20 },
  badgeRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 10 },
  badge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 12, fontWeight: "600" },
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
  empty: { alignItems: "center", justifyContent: "center", paddingTop: 80 },
  emptyTitle: { fontSize: 18, fontWeight: "600", marginBottom: 6 },
  emptySubtitle: { fontSize: 13, textAlign: "center", maxWidth: 280 },
  seedBtn: { marginTop: 16, paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  seedBtnText: { color: colors.onPrimary, fontWeight: "600", fontSize: 14 },
});
