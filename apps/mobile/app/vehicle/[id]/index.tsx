import { StyleSheet, ScrollView, TouchableOpacity, View, Alert } from "react-native";
import { useLocalSearchParams, useRouter, useTheme } from "expo-router";
import { useVehicle, useServiceTypeSummaries, useServiceTypes, useDeleteVehicle, useVisitsForVehicle } from "@/src/hooks/useDatabase";
import { useUpcomingMaintenance } from "@/src/hooks/useUpcomingMaintenance";
import { Text } from "@/components/Themed";
import { useState } from "react";
import { useUnits } from "@/src/hooks/useUnits";
import type { ServiceEventRead } from "@/src/types";

export default function VehicleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const { data: vehicle } = useVehicle(id);
  const { data: summaries = [] } = useServiceTypeSummaries(id);
  const { data: allServiceTypes = [] } = useServiceTypes();
  const { data: visits = [] } = useVisitsForVehicle(id);
  const deleteMutation = useDeleteVehicle();
  const units = useUnits();

  const [activeTab, setActiveTab] = useState<"overview" | "categories" | "history">("overview");

  const upcomingItems = useUpcomingMaintenance({
    vehicle,
    serviceTypeSummaries: summaries,
    allServiceTypes,
  });

  if (!vehicle) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text, textAlign: "center", marginTop: 40 }}>Loading vehicle...</Text>
      </View>
    );
  }

  const totalCost = vehicle.maintenance_logs.reduce((sum, l) => sum + l.cost_cents, 0);
  const logCount = vehicle.maintenance_logs.length;
  const currentMileage = vehicle.current_mileage ?? 0;

  const overdueItems = upcomingItems.filter((i) => i.status === "Overdue");
  const dueSoonItems = upcomingItems.filter((i) => i.status === "Upcoming");
  const okItems = upcomingItems.filter((i) => i.status === "OK");

  /** A garage visit; a log recorded on its own is a single-item visit. `full` lists each service. */
  const renderVisit = (visit: ServiceEventRead, full: boolean) => {
    const notes = visit.notes ?? (visit.standalone ? visit.items[0]?.notes : null);
    const showItems = full && visit.items.length > 1;
    return (
      <TouchableOpacity
        key={visit.id}
        style={[styles.logCard, { backgroundColor: colors.card, borderColor: colors.border }]}
        onPress={() => router.push(visit.standalone ? `/vehicle/${id}/edit-log/${visit.id}` : `/vehicle/${id}/edit-visit/${visit.id}`)}
        activeOpacity={0.7}
      >
        <View style={styles.logHeader}>
          <Text style={[styles.logService, { color: colors.text, flex: 1 }]} numberOfLines={full ? undefined : 1}>
            {visit.items.map((item) => item.service_type?.name ?? "Service").join(" + ") || "Service"}
          </Text>
          <Text style={[styles.logCost, { color: colors.primary }]}>{units.money(visit.total_cost_cents)}</Text>
        </View>
        <View style={styles.logMeta}>
          <Text style={[styles.logDetail, { color: (colors.text as string) + "88" }]}>{visit.date}</Text>
          <Text style={[styles.logDetail, { color: (colors.text as string) + "88" }]}>{units.distance(visit.mileage)}</Text>
          {visit.shop && <Text style={[styles.logDetail, { color: (colors.text as string) + "88" }]}>{visit.shop}</Text>}
        </View>
        {notes && (
          <Text style={[styles.logNotes, { color: (colors.text as string) + "77" }]} numberOfLines={full ? undefined : 1}>
            {notes}
          </Text>
        )}
        {showItems &&
          visit.items.map((item) => (
            <View key={item.id} style={[styles.itemRow, { borderTopColor: colors.border }]}>
              <View style={styles.logHeader}>
                <Text style={[styles.logDetail, { color: colors.text }]}>{item.service_type?.name ?? "Service"}</Text>
                <Text style={[styles.logDetail, { color: (colors.text as string) + "88" }]}>{units.money(item.cost_cents)}</Text>
              </View>
              {item.notes && <Text style={[styles.logNotes, { color: (colors.text as string) + "77" }]}>{item.notes}</Text>}
            </View>
          ))}
        {full && visit.items.some((item) => item.custom_field_values.length > 0) && (
          <View style={[styles.cfvRow, { borderTopColor: colors.border }]}>
            {visit.items.flatMap((item) =>
              item.custom_field_values.map((cfv) => (
                <Text key={cfv.id} style={[styles.cfvBadge, { color: (colors.text as string) + "88" }]}>
                  {cfv.custom_field.name}: {cfv.value} {cfv.custom_field.unit ?? ""}
                </Text>
              ))
            )}
          </View>
        )}
      </TouchableOpacity>
    );
  };

  const handleDelete = () => {
    Alert.alert("Delete Vehicle", `Delete "${vehicle.make} ${vehicle.model}"? This cannot be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteMutation.mutate(vehicle.id, { onSuccess: () => router.back() });
        },
      },
    ]);
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]} contentContainerStyle={styles.content}>
      {/* Spec Header Card */}
      <View style={[styles.header, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.headerTitleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerMake, { color: colors.primary }]}>{vehicle.make}</Text>
            <Text style={[styles.headerModel, { color: colors.text }]}>{vehicle.model}</Text>
          </View>
          <TouchableOpacity
            style={[styles.editSpecBtn, { borderColor: colors.border }]}
            onPress={() => router.push(`/vehicle/${id}/edit`)}
            activeOpacity={0.7}
          >
            <Text style={[styles.editBtnText, { color: colors.text }]}>Edit Specs</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.specSubRow}>
          {vehicle.year && <Text style={[styles.specBadge, { color: (colors.text as string) + "99" }]}>{vehicle.year}</Text>}
          {vehicle.vin && (
            <Text style={[styles.headerVin, { color: (colors.text as string) + "77" }]}>
              VIN: {vehicle.vin}
            </Text>
          )}
          {vehicle.acquisition_date && (
            <Text style={[styles.headerVin, { color: (colors.text as string) + "77" }]}>
              Acquired: {vehicle.acquisition_date}
            </Text>
          )}
        </View>

        {/* Telemetry KPIs */}
        <View style={[styles.kpiRow, { borderTopColor: colors.border }]}>
          <View style={styles.kpi}>
            <Text style={[styles.kpiValue, { color: colors.text }]}>{units.toDisplay(currentMileage).toLocaleString()}</Text>
            <Text style={[styles.kpiLabel, { color: (colors.text as string) + "77" }]}>Odometer ({units.unit})</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={[styles.kpiValue, { color: colors.text }]}>{units.money(totalCost)}</Text>
            <Text style={[styles.kpiLabel, { color: (colors.text as string) + "77" }]}>Total Spent</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={[styles.kpiValue, { color: colors.text }]}>{logCount}</Text>
            <Text style={[styles.kpiLabel, { color: (colors.text as string) + "77" }]}>Logs</Text>
          </View>
        </View>

        {/* Health Cadence Status Pills */}
        <View style={[styles.healthPillRow, { borderTopColor: colors.border }]}>
          <View style={[styles.healthPill, { backgroundColor: overdueItems.length > 0 ? "#ef444420" : "#10b98115", borderColor: overdueItems.length > 0 ? "#ef444440" : "#10b98130" }]}>
            <Text style={[styles.healthPillText, { color: overdueItems.length > 0 ? "#ef4444" : "#10b981" }]}>
              {overdueItems.length > 0 ? `⚠ ${overdueItems.length} Overdue` : "✓ Up to Date"}
            </Text>
          </View>
          {dueSoonItems.length > 0 && (
            <View style={[styles.healthPill, { backgroundColor: "#f59e0b20", borderColor: "#f59e0b40" }]}>
              <Text style={[styles.healthPillText, { color: "#f59e0b" }]}>
                {dueSoonItems.length} Due Soon
              </Text>
            </View>
          )}
          <View style={[styles.healthPill, { backgroundColor: (colors.text as string) + "10", borderColor: colors.border }]}>
            <Text style={[styles.healthPillText, { color: (colors.text as string) + "88" }]}>
              {okItems.length} OK
            </Text>
          </View>
        </View>
      </View>

      {/* Main Action Buttons */}
      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.actionBtn, { backgroundColor: colors.primary }]}
          onPress={() => router.push(`/vehicle/${id}/add-log`)}
          activeOpacity={0.8}
        >
          <Text style={styles.actionBtnText}>+ Add Visit</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, styles.actionBtnOutline, { borderColor: colors.border }]}
          onPress={() => router.push(`/vehicle/${id}/settings`)}
          activeOpacity={0.8}
        >
          <Text style={[styles.actionBtnOutlineText, { color: colors.text }]}>Interval Overrides</Text>
        </TouchableOpacity>
      </View>
      <TouchableOpacity
        style={[styles.actionBtn, styles.actionBtnOutline, styles.odometerBtn, { borderColor: colors.border }]}
        onPress={() => router.push(`/vehicle/${id}/odometer`)}
        activeOpacity={0.8}
      >
        <Text style={[styles.actionBtnOutlineText, { color: colors.text }]}>Update Odometer</Text>
      </TouchableOpacity>

      {/* Tab Switcher */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === "overview" && { backgroundColor: colors.primary }]}
          onPress={() => setActiveTab("overview")}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, { color: activeTab === "overview" ? "#fff" : colors.text }]}>
            Overview
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === "categories" && { backgroundColor: colors.primary }]}
          onPress={() => setActiveTab("categories")}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, { color: activeTab === "categories" ? "#fff" : colors.text }]}>
            Categories ({summaries.length})
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tabItem, activeTab === "history" && { backgroundColor: colors.primary }]}
          onPress={() => setActiveTab("history")}
          activeOpacity={0.7}
        >
          <Text style={[styles.tabText, { color: activeTab === "history" ? "#fff" : colors.text }]}>
            History ({visits.length})
          </Text>
        </TouchableOpacity>
      </View>

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && (
        <View style={styles.tabContent}>
          {/* Urgent Items Section */}
          {(overdueItems.length > 0 || dueSoonItems.length > 0) && (
            <View style={styles.sectionBlock}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Maintenance Due</Text>
              {[...overdueItems, ...dueSoonItems].map((item) => (
                <View
                  key={item.serviceTypeId}
                  style={[
                    styles.urgentCard,
                    {
                      backgroundColor: colors.card,
                      borderColor: item.status === "Overdue" ? "#ef444450" : "#f59e0b50",
                    },
                  ]}
                >
                  <View style={styles.urgentCardTop}>
                    <Text style={[styles.urgentName, { color: colors.text }]}>{item.serviceTypeName}</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        {
                          backgroundColor: item.status === "Overdue" ? "#ef444420" : "#f59e0b20",
                        },
                      ]}
                    >
                      <Text
                        style={[
                          styles.statusBadgeText,
                          { color: item.status === "Overdue" ? "#ef4444" : "#f59e0b" },
                        ]}
                      >
                        {item.status.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                  <Text style={[styles.urgentMessage, { color: (colors.text as string) + "99" }]}>
                    {item.message}
                  </Text>
                  <View style={styles.urgentActionRow}>
                    <TouchableOpacity
                      style={[styles.quickLogBtn, { backgroundColor: colors.primary }]}
                      onPress={() => router.push(`/vehicle/${id}/add-log`)}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.quickLogBtnText}>Log this service</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* Recent Activity */}
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Recent Visits</Text>
              {visits.length > 5 && (
                <TouchableOpacity onPress={() => setActiveTab("history")}>
                  <Text style={[styles.seeAllText, { color: colors.primary }]}>View all ({visits.length})</Text>
                </TouchableOpacity>
              )}
            </View>

            {visits.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.emptyText, { color: (colors.text as string) + "88" }]}>No maintenance logged yet.</Text>
              </View>
            ) : (
              visits.slice(0, 5).map((visit) => renderVisit(visit, false))
            )}
          </View>
        </View>
      )}

      {/* TAB 2: CATEGORIES */}
      {activeTab === "categories" && (
        <View style={styles.tabContent}>
          {summaries.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: (colors.text as string) + "88" }]}>No category logs recorded yet.</Text>
            </View>
          ) : (
            summaries.map((s) => (
              <TouchableOpacity
                key={s.service_type_id}
                style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}
                onPress={() => router.push(`/vehicle/${id}/history/${s.service_type_id}`)}
                activeOpacity={0.7}
              >
                <View style={styles.summaryTop}>
                  <Text style={[styles.summaryName, { color: colors.text }]}>{s.service_type_name}</Text>
                  <Text style={[styles.summaryTotal, { color: colors.primary }]}>
                    {units.money(s.total_cost_cents)}
                  </Text>
                </View>
                <View style={styles.summaryMetaRow}>
                  <Text style={[styles.summaryDetail, { color: (colors.text as string) + "88" }]}>
                    {s.log_count} log{s.log_count !== 1 ? "s" : ""}
                  </Text>
                  {s.last_log_date && (
                    <Text style={[styles.summaryDetail, { color: (colors.text as string) + "88" }]}>
                      Last: {s.last_log_date} ({s.last_log_mileage != null ? units.distance(s.last_log_mileage) : "—"})
                    </Text>
                  )}
                </View>
              </TouchableOpacity>
            ))
          )}
        </View>
      )}

      {/* TAB 3: FULL HISTORY */}
      {activeTab === "history" && (
        <View style={styles.tabContent}>
          {visits.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: (colors.text as string) + "88" }]}>No logs on record.</Text>
            </View>
          ) : (
            visits.map((visit) => renderVisit(visit, true))
          )}
        </View>
      )}

      {/* Danger Zone */}
      <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete} activeOpacity={0.8}>
        <Text style={styles.deleteBtnText}>Delete Vehicle</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 50 },
  header: { borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 14 },
  headerTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerMake: { fontSize: 13, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.5 },
  headerModel: { fontSize: 22, fontWeight: "800", marginTop: 2 },
  specSubRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  specBadge: { fontSize: 12, fontWeight: "600" },
  headerVin: { fontSize: 11, fontFamily: "SpaceMono" },
  editSpecBtn: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5 },
  editBtnText: { fontSize: 12, fontWeight: "600" },
  kpiRow: { flexDirection: "row", borderTopWidth: 1, marginTop: 14, paddingTop: 14 },
  kpi: { flex: 1, alignItems: "center" },
  kpiValue: { fontSize: 16, fontWeight: "800" },
  kpiLabel: { fontSize: 11, marginTop: 2 },
  healthPillRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, borderTopWidth: 1, marginTop: 12, paddingTop: 12 },
  healthPill: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  healthPillText: { fontSize: 11, fontWeight: "700" },
  actions: { flexDirection: "row", gap: 10, marginBottom: 14 },
  actionBtn: { flex: 1, borderRadius: 12, paddingVertical: 12, alignItems: "center" },
  actionBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  actionBtnOutline: { backgroundColor: "transparent", borderWidth: 1 },
  actionBtnOutlineText: { fontSize: 14, fontWeight: "700" },
  odometerBtn: { flex: 0, marginTop: -4, marginBottom: 14 },
  tabBar: { flexDirection: "row", borderRadius: 10, borderWidth: 1, padding: 3, marginBottom: 16 },
  tabItem: { flex: 1, paddingVertical: 8, alignItems: "center", borderRadius: 8 },
  tabText: { fontSize: 12, fontWeight: "600" },
  tabContent: { marginBottom: 20 },
  sectionBlock: { marginBottom: 18 },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: "700", marginBottom: 10 },
  seeAllText: { fontSize: 12, fontWeight: "600" },
  urgentCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  urgentCardTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  urgentName: { fontSize: 15, fontWeight: "700" },
  statusBadge: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  statusBadgeText: { fontSize: 10, fontWeight: "800" },
  urgentMessage: { fontSize: 12, marginTop: 4, marginBottom: 10 },
  urgentActionRow: { flexDirection: "row", justifyContent: "flex-end" },
  quickLogBtn: { borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  quickLogBtnText: { color: "#fff", fontSize: 11, fontWeight: "700" },
  emptyCard: { borderRadius: 12, borderWidth: 1, padding: 20, alignItems: "center" },
  emptyText: { fontSize: 13 },
  summaryCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 8 },
  summaryTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryName: { fontSize: 14, fontWeight: "700" },
  summaryTotal: { fontSize: 14, fontWeight: "800" },
  summaryMetaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  summaryDetail: { fontSize: 12 },
  logCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 8 },
  logHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logService: { fontSize: 14, fontWeight: "700" },
  logCost: { fontSize: 14, fontWeight: "800" },
  logMeta: { flexDirection: "row", gap: 12, marginTop: 4 },
  logDetail: { fontSize: 12 },
  logNotes: { fontSize: 12, marginTop: 4, fontStyle: "italic" },
  itemRow: { borderTopWidth: 1, marginTop: 8, paddingTop: 6 },
  cfvRow: { borderTopWidth: 1, marginTop: 8, paddingTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cfvBadge: { fontSize: 11, fontFamily: "SpaceMono" },
  deleteBtn: { marginTop: 10, borderRadius: 12, paddingVertical: 14, alignItems: "center", backgroundColor: "#ef444415", borderWidth: 1, borderColor: "#ef444430" },
  deleteBtnText: { color: "#ef4444", fontSize: 14, fontWeight: "700" },
});
