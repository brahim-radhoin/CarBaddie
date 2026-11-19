import { StyleSheet, ScrollView, TouchableOpacity, Pressable, View, Alert } from "react-native";
import { formatISO } from "@/src/dates";
import { STATUS_LABEL, summariseStatuses } from "@carbaddie/core";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useTheme, figures, type Palette } from "@/src/theme";
import { Button, Icon, StatusDot } from "@/components/Controls";
import { useVehicle, useServiceTypeSummaries, useServiceTypes, useDeleteVehicle, useVisitsForVehicle } from "@/src/hooks/useDatabase";
import { useUpcomingMaintenance } from "@/src/hooks/useUpcomingMaintenance";
import { Text } from "@/components/Themed";
import { useState, useMemo } from "react";
import { useUnits } from "@/src/hooks/useUnits";
import type { ServiceEventRead } from "@/src/types";

export default function VehicleDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { colors } = useTheme();

  const styles = useMemo(() => makeStyles(colors), [colors]);
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
        <Text style={{ color: colors.text, textAlign: "center", marginTop: 40 }}>Loading vehicle</Text>
      </View>
    );
  }

  const totalCost = vehicle.maintenance_logs.reduce((sum, l) => sum + l.cost_cents, 0);
  const logCount = vehicle.maintenance_logs.length;
  const currentMileage = vehicle.current_mileage ?? 0;

  const overdueItems = upcomingItems.filter((i) => i.status === "Overdue");
  const dueSoonItems = upcomingItems.filter((i) => i.status === "Upcoming");

  /** A garage visit; a log recorded on its own is a single-item visit. `full` lists each service. */
  const renderVisit = (visit: ServiceEventRead, full: boolean) => {
    const notes = visit.notes ?? (visit.standalone ? visit.items[0]?.notes : null);
    const showItems = full && visit.items.length > 1;
    return (
      <TouchableOpacity accessibilityRole="button"
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
          <Text style={[styles.logDetail, { color: colors.textSecondary }]}>{formatISO(visit.date)}</Text>
          <Text style={[styles.logDetail, { color: colors.textSecondary }]}>{units.distance(visit.mileage)}</Text>
          {visit.shop && <Text style={[styles.logDetail, { color: colors.textSecondary }]}>{visit.shop}</Text>}
        </View>
        {notes && (
          <Text style={[styles.logNotes, { color: colors.textMuted }]} numberOfLines={full ? undefined : 1}>
            {notes}
          </Text>
        )}
        {showItems &&
          visit.items.map((item) => (
            <View key={item.id} style={[styles.itemRow, { borderTopColor: colors.border }]}>
              <View style={styles.logHeader}>
                <Text style={[styles.logDetail, { color: colors.text }]}>{item.service_type?.name ?? "Service"}</Text>
                <Text style={[styles.logDetail, { color: colors.textSecondary }]}>{units.money(item.cost_cents)}</Text>
              </View>
              {item.notes && <Text style={[styles.logNotes, { color: colors.textMuted }]}>{item.notes}</Text>}
            </View>
          ))}
        {full && visit.items.some((item) => item.custom_field_values.length > 0) && (
          <View style={[styles.cfvRow, { borderTopColor: colors.border }]}>
            {visit.items.flatMap((item) =>
              item.custom_field_values.map((cfv) => (
                <Text key={cfv.id} style={[styles.cfvBadge, { color: colors.textSecondary }]}>
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
    Alert.alert("Delete vehicle", `Delete "${vehicle.make} ${vehicle.model}"? This cannot be undone.`, [
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
      {/* Spec header: identity, then the three numbers, then due state */}
      <View style={[styles.header, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <View style={styles.headerTitleRow}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.headerMake, { color: colors.textSecondary }]}>{vehicle.make}</Text>
            <Text style={[styles.headerModel, { color: colors.text }]} accessibilityRole="header">{vehicle.model}</Text>
          </View>
          <Button label="Edit details" variant="outline" onPress={() => router.push(`/vehicle/${id}/edit`)} />
        </View>

        <View style={styles.specSubRow}>
          {vehicle.year && <Text style={[styles.specBadge, { color: colors.textSecondary }]}>{vehicle.year}</Text>}
          {vehicle.vin && <Text style={[styles.headerVin, { color: colors.textMuted }]}>VIN {vehicle.vin}</Text>}
          {vehicle.acquisition_date && <Text style={[styles.headerVin, { color: colors.textMuted }]}>Acquired {formatISO(vehicle.acquisition_date)}</Text>}
        </View>

        <View style={[styles.kpiRow, { borderTopColor: colors.border }]}>
          <Pressable
            style={({ pressed }) => [styles.kpi, pressed && { backgroundColor: colors.raised }]}
            onPress={() => router.push(`/vehicle/${id}/odometer`)}
            accessibilityRole="button"
            accessibilityLabel={`Odometer ${units.toDisplay(currentMileage).toLocaleString()} ${units.unit}`}
            accessibilityHint="Opens odometer readings"
          >
            <Text style={[styles.kpiValue, figures, { color: colors.text }]}>{units.toDisplay(currentMileage).toLocaleString()}</Text>
            <View style={styles.kpiLabelRow}>
              <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Odometer ({units.unit})</Text>
              <Icon name="chevron" color={colors.textMuted} size={12} />
            </View>
          </Pressable>
          <View style={styles.kpi}>
            <Text style={[styles.kpiValue, figures, { color: colors.text }]}>{units.money(totalCost)}</Text>
            <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Total spent</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={[styles.kpiValue, figures, { color: colors.text }]}>{logCount}</Text>
            <Text style={[styles.kpiLabel, { color: colors.textMuted }]}>Logs</Text>
          </View>
        </View>

        <View style={[styles.statusRow, { borderTopColor: colors.border }]} accessible>
          <StatusDot status={overdueItems.length > 0 ? "overdue" : dueSoonItems.length > 0 ? "soon" : "ok"} />
          <Text style={[styles.statusText, { color: colors.textSecondary }]}>
            {summariseStatuses(upcomingItems)}
          </Text>
        </View>
      </View>

      {/* What is due comes first: it is why the app exists */}
      {(overdueItems.length > 0 || dueSoonItems.length > 0) && (
        <View style={styles.sectionBlock}>
          <Text style={[styles.sectionTitle, { color: colors.text }]} accessibilityRole="header">Due</Text>
          {[...overdueItems, ...dueSoonItems].map((item) => (
            <View key={item.serviceTypeId} style={[styles.urgentCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.urgentCardTop}>
                <StatusDot status={item.status === "Overdue" ? "overdue" : "soon"} />
                <Text style={[styles.urgentName, { color: colors.text }]}>{item.serviceTypeName}</Text>
                <Text style={[styles.statusBadgeText, { color: item.status === "Overdue" ? colors.danger : colors.warn }]}>
                  {STATUS_LABEL[item.status]}
                </Text>
              </View>
              <Text style={[styles.urgentMessage, { color: colors.textSecondary }]}>{item.message}</Text>
              <Button label="Log this service" variant="outline" style={styles.urgentAction} onPress={() => router.push(`/vehicle/${id}/add-log`)} />
            </View>
          ))}
        </View>
      )}

      <Button label="Add visit" onPress={() => router.push(`/vehicle/${id}/add-log`)} style={styles.primaryAction} />

      {/* Tab switcher */}
      <View style={[styles.tabBar, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityRole="tablist">
        {([
          ["overview", "Overview"],
          ["categories", `Service types (${summaries.length})`],
          ["history", `History (${visits.length})`],
        ] as const).map(([key, label]) => (
          <Pressable
            key={key}
            accessibilityRole="tab"
            accessibilityState={{ selected: activeTab === key }}
            style={[styles.tabItem, activeTab === key && { backgroundColor: colors.primary }]}
            onPress={() => setActiveTab(key)}
          >
            <Text style={[styles.tabText, { color: activeTab === key ? colors.onPrimary : colors.text }]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {/* TAB 1: OVERVIEW */}
      {activeTab === "overview" && (
        <View style={styles.tabContent}>
          {/* Recent Activity */}
          <View style={styles.sectionBlock}>
            <View style={styles.sectionHeaderRow}>
              <Text style={[styles.sectionTitle, { color: colors.text, marginBottom: 0 }]}>Recent visits</Text>
              {visits.length > 5 && (
                <TouchableOpacity accessibilityRole="button" hitSlop={12} onPress={() => setActiveTab("history")}>
                  <Text style={[styles.seeAllText, { color: colors.accent }]}>View all ({visits.length})</Text>
                </TouchableOpacity>
              )}
            </View>

            {visits.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No maintenance logged yet.</Text>
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
          <Button label="Interval overrides" variant="outline" style={{ marginBottom: 12 }} onPress={() => router.push(`/vehicle/${id}/settings`)} />
          {summaries.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No service types logged yet.</Text>
            </View>
          ) : (
            summaries.map((s) => (
              <TouchableOpacity accessibilityRole="button"
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
                  <Text style={[styles.summaryDetail, { color: colors.textSecondary }]}>
                    {s.log_count} log{s.log_count !== 1 ? "s" : ""}
                  </Text>
                  {s.last_log_date && (
                    <Text style={[styles.summaryDetail, { color: colors.textSecondary }]}>
                      Last: {formatISO(s.last_log_date)} ({s.last_log_mileage != null ? units.distance(s.last_log_mileage) : "—"})
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
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No logs on record.</Text>
            </View>
          ) : (
            visits.map((visit) => renderVisit(visit, true))
          )}
        </View>
      )}

      {/* Danger Zone */}
      <TouchableOpacity accessibilityRole="button" style={styles.deleteBtn} onPress={handleDelete} activeOpacity={0.8}>
        <Text style={styles.deleteBtnText}>Delete vehicle</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const makeStyles = (colors: Palette) => StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16, paddingBottom: 50 },
  header: { borderRadius: 16, borderWidth: 1, padding: 18, marginBottom: 14 },
  headerTitleRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  headerMake: { fontSize: 13, fontWeight: "600" },
  headerModel: { fontSize: 22, fontWeight: "600", marginTop: 2 },
  specSubRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  specBadge: { fontSize: 12, fontWeight: "600" },
  headerVin: { fontSize: 12, fontFamily: "SpaceMono" },
  kpiRow: { flexDirection: "row", borderTopWidth: 1, marginTop: 14, paddingTop: 14 },
  kpi: { flex: 1, alignItems: "center", paddingVertical: 6, borderRadius: 8 },
  kpiValue: { fontSize: 16, fontWeight: "600" },
  kpiLabelRow: { flexDirection: "row", alignItems: "center", gap: 2, marginTop: 2 },
  kpiLabel: { fontSize: 12, marginTop: 2 },
  statusRow: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: 1, marginTop: 12, paddingTop: 12 },
  statusText: { fontSize: 13, fontWeight: "500", flex: 1 },
  primaryAction: { marginBottom: 16 },
  urgentAction: { alignSelf: "flex-end" },
  tabBar: { flexDirection: "row", borderRadius: 10, borderWidth: 1, padding: 3, marginBottom: 16 },
  tabItem: { flex: 1, minHeight: 44, justifyContent: "center", paddingVertical: 8, alignItems: "center", borderRadius: 8 },
  tabText: { fontSize: 12, fontWeight: "600" },
  tabContent: { marginBottom: 20 },
  sectionBlock: { marginBottom: 18 },
  sectionHeaderRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 },
  sectionTitle: { fontSize: 15, fontWeight: "600", marginBottom: 10 },
  seeAllText: { fontSize: 13, fontWeight: "600" },
  urgentCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 10 },
  urgentCardTop: { flexDirection: "row", alignItems: "center", gap: 8 },
  urgentName: { fontSize: 15, fontWeight: "600", flex: 1 },
  statusBadgeText: { fontSize: 12, fontWeight: "600" },
  urgentMessage: { fontSize: 12, marginTop: 4, marginBottom: 10 },
  urgentActionRow: { flexDirection: "row", justifyContent: "flex-end" },
  emptyCard: { borderRadius: 12, borderWidth: 1, padding: 20, alignItems: "center" },
  emptyText: { fontSize: 13 },
  summaryCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 8 },
  summaryTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  summaryName: { fontSize: 14, fontWeight: "600" },
  summaryTotal: { fontSize: 14, fontWeight: "600" },
  summaryMetaRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 4 },
  summaryDetail: { fontSize: 12 },
  logCard: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 8 },
  logHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  logService: { fontSize: 14, fontWeight: "600" },
  logCost: { fontSize: 14, fontWeight: "600" },
  logMeta: { flexDirection: "row", gap: 12, marginTop: 4 },
  logDetail: { fontSize: 12 },
  logNotes: { fontSize: 12, marginTop: 4 },
  itemRow: { borderTopWidth: 1, marginTop: 8, paddingTop: 6 },
  cfvRow: { borderTopWidth: 1, marginTop: 8, paddingTop: 6, flexDirection: "row", flexWrap: "wrap", gap: 8 },
  cfvBadge: { fontSize: 12, fontFamily: "SpaceMono" },
  deleteBtn: { marginTop: 10, minHeight: 48, borderRadius: 12, justifyContent: "center", alignItems: "center", backgroundColor: "transparent", borderWidth: 1, borderColor: colors.border },
  deleteBtnText: { color: colors.danger, fontSize: 14, fontWeight: "600" },
});
