import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import {
  BODY_TYPES,
  SILHOUETTES,
  STATUS_LABEL,
  ZONE_LABEL,
  drawableBodyType,
  groupByZone,
  summariseStatuses,
  zoneStatus,
  type DrawnZoneId,
  type ZoneId,
  type ZoneService,
} from "@carbaddie/core";
import { Text } from "@/components/Themed";
import { Button, Icon, StatusDot } from "@/components/Controls";
import { Sheet } from "@/components/Sheet";
import { VehicleOutline } from "@/components/VehicleOutline";
import { figures, useTheme } from "@/src/theme";
import { useServiceTypes, useServiceTypeSummaries, useVisitsForVehicle } from "@/src/hooks/useDatabase";
import { formatISO } from "@/src/dates";
import { useUpcomingMaintenance } from "@/src/hooks/useUpcomingMaintenance";
import { useUnits } from "@/src/hooks/useUnits";
import type { VehicleRead } from "@/src/types";

/** Everything a card needs about one vehicle: its due services grouped by the part they belong to. */
export function useGarageData(vehicle: VehicleRead) {
  const { data: summaries = [] } = useServiceTypeSummaries(vehicle.id);
  const { data: types = [] } = useServiceTypes();
  const items = useUpcomingMaintenance({ vehicle, serviceTypeSummaries: summaries, allServiceTypes: types });
  return useMemo(() => {
    const bodyType = drawableBodyType(vehicle.body_type, vehicle.make);
    const art = SILHOUETTES[bodyType];
    const services = items.map((i) => ({
      serviceTypeId: i.serviceTypeId,
      name: i.serviceTypeName,
      status: i.status,
      message: i.message,
      slug: types.find((t) => t.id === i.serviceTypeId)?.slug ?? null,
    }));
    const groups = groupByZone(services, Object.keys(art.zones) as DrawnZoneId[], art.alias);
    const due = items
      .filter((i) => i.status === "Overdue" || i.status === "Upcoming")
      .sort((a, b) => (a.status === b.status ? 0 : a.status === "Overdue" ? -1 : 1));
    return { bodyType, art, items, groups, due };
  }, [items, types, vehicle.body_type, vehicle.make]);
}

export type SheetTarget = { vehicle: VehicleRead; zone: ZoneId | "due" | "parts" };

/** A vehicle's big card: outline, odometer, what is due, and the way to log it. */
export function GarageCard({ vehicle, width, height, onSheet }: { vehicle: VehicleRead; width: number; height: number; onSheet: (t: SheetTarget) => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const units = useUnits();
  const { bodyType, art, items, groups, due } = useGarageData(vehicle);
  const { data: visits = [] } = useVisitsForVehicle(vehicle.id);
  const upNext = items.filter((i) => i.status === "OK" && i.message.startsWith("Next due"));
  const label = BODY_TYPES.find((t) => t.id === bodyType)?.label ?? "Car";
  const odometer = vehicle.current_mileage != null ? units.toDisplay(vehicle.current_mileage).toLocaleString() : "—";
  const open = () => router.push(`/vehicle/${vehicle.id}`);
  const wholeStatus = zoneStatus(groups.whole);
  const zoneOfService = (serviceTypeId: string): ZoneId => (Object.keys(groups) as ZoneId[]).find((z) => groups[z].some((s) => s.serviceTypeId === serviceTypeId)) ?? "other";

  return (
    <View style={[styles.card, { width, height, backgroundColor: colors.card, borderColor: colors.border }]}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.cardBody} nestedScrollEnabled>
        <Pressable accessibilityRole="button" accessibilityLabel={`${vehicle.make} ${vehicle.model}, open`} onPress={open} style={styles.head}>
          <View style={styles.flex}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{vehicle.make} {vehicle.model}</Text>
            <Text style={[styles.sub, { color: colors.textMuted }]} numberOfLines={1}>{[vehicle.year, label].filter(Boolean).join(" · ")}</Text>
          </View>
          <View style={styles.odo}>
            <Text style={[styles.odoValue, figures, { color: colors.text }]}>{odometer}</Text>
            <Text style={[styles.sub, { color: colors.textMuted }]}>{units.unit}</Text>
          </View>
        </Pressable>

        <View style={styles.outline}>
          <VehicleOutline bodyType={bodyType} zones={groups} onZone={(zone) => onSheet({ vehicle, zone })} />
        </View>

        <View accessible accessibilityLabel={summariseStatuses(items)} style={styles.summary}>
          <StatusDot status={due.some((d) => d.status === "Overdue") ? "overdue" : due.length ? "soon" : "ok"} />
          <Text style={[styles.summaryText, { color: colors.textSecondary }]}>{summariseStatuses(items)}</Text>
        </View>

        {due.slice(0, 3).map((item) => (
          <Pressable
            key={item.serviceTypeId}
            accessibilityRole="button"
            accessibilityLabel={`${item.serviceTypeName}, ${STATUS_LABEL[item.status]}, ${item.message}`}
            onPress={() => onSheet({ vehicle, zone: zoneOfService(item.serviceTypeId) })}
            style={styles.row}
          >
            <StatusDot status={item.status === "Overdue" ? "overdue" : "soon"} />
            <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{item.serviceTypeName}</Text>
            <Text style={[styles.rowMsg, { color: colors.textSecondary }]} numberOfLines={1}>{item.message}</Text>
          </Pressable>
        ))}
        {due.length < 3 && upNext.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Coming up</Text>
            {upNext.slice(0, 3 - due.length).map((item) => (
              <View key={item.serviceTypeId} style={styles.row} accessible accessibilityLabel={`${item.serviceTypeName}, ${item.message}`}>
                <StatusDot status="ok" />
                <Text style={[styles.rowName, { color: colors.text }]} numberOfLines={1}>{item.serviceTypeName}</Text>
                <Text style={[styles.rowMsg, { color: colors.textSecondary }]} numberOfLines={1}>{item.message.replace(/^Next due /, "")}</Text>
              </View>
            ))}
          </>
        )}
        {due.length > 3 && (
          <Pressable accessibilityRole="button" onPress={() => onSheet({ vehicle, zone: "due" })} style={styles.more}>
            <Text style={[styles.moreText, { color: colors.accent }]}>All {due.length} due</Text>
          </Pressable>
        )}

        <View style={styles.chips}>
          <Chip label="Parts" onPress={() => onSheet({ vehicle, zone: "parts" })} />
          {groups.whole.length > 0 && <Chip label={`Whole vehicle · ${wholeStatus === "overdue" ? "overdue" : wholeStatus === "soon" ? "due soon" : "on track"}`} onPress={() => onSheet({ vehicle, zone: "whole" })} />}
          {groups.other.length > 0 && <Chip label={`Other · ${groups.other.length}`} onPress={() => onSheet({ vehicle, zone: "other" })} />}
        </View>
        {visits.length === 0 && due.length === 0 && upNext.length === 0 && (
          <Text style={[styles.hint, { color: colors.textSecondary }]}>Log a visit and CarBaddie works out what is due and when.</Text>
        )}
        {visits.length > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>Recent visits</Text>
            {visits.slice(0, 2).map((visit) => (
              <Pressable
                key={visit.id}
                accessibilityRole="button"
                onPress={() => router.push(visit.standalone ? `/vehicle/${vehicle.id}/edit-log/${visit.id}` : `/vehicle/${vehicle.id}/edit-visit/${visit.id}`)}
                style={styles.row}
              >
                <Text style={[styles.visitDate, figures, { color: colors.textMuted }]}>{formatISO(visit.date)}</Text>
                <Text style={[styles.rowName, styles.flex, { color: colors.text }]} numberOfLines={1}>{visit.items.map((i) => i.service_type?.name ?? "Service").join(" + ") || "Service"}</Text>
                <Text style={[styles.rowMsg, figures, { color: colors.textSecondary }]}>{units.money(visit.total_cost_cents)}</Text>
              </Pressable>
            ))}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Chip({ label, onPress }: { label: string; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.chip, { backgroundColor: pressed ? colors.border : colors.raised, borderColor: colors.border }]}
    >
      <Text style={[styles.chipText, { color: colors.text }]}>{label}</Text>
    </Pressable>
  );
}

/** The empty garage: a dashed outline and the one thing to do. */
export function EmptyGarage({ onAdd }: { onAdd: () => void }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.empty, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <VehicleOutline bodyType="car" zones={{ engine: [], wheels: [], underbody: [], cabin: [], lights: [], whole: [], other: [] }} dashed />
      <Text style={[styles.emptyTitle, { color: colors.text }]}>Add your first vehicle</Text>
      <Text style={[styles.emptyBody, { color: colors.textSecondary }]}>Pick its type and your garage gets a matching outline that shows what is due.</Text>
      <Button label="Add vehicle" onPress={onAdd} style={styles.emptyButton} />
    </View>
  );
}

/** The services of one part (or all that are due), each with a way to log it. */
export function ServicesSheet({ target, onClose }: { target: SheetTarget | null; onClose: () => void }) {
  // The body calls hooks that need a vehicle, so it only exists while there is a target.
  return target ? <ServicesSheetBody key={target.vehicle.id} target={target} onClose={onClose} /> : null;
}

function ServicesSheetBody({ target, onClose }: { target: SheetTarget; onClose: () => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const vehicle = target.vehicle;
  const { art, groups, due } = useGarageData(vehicle);
  const name = `${vehicle.make} ${vehicle.model}`;

  const log = (serviceTypeId: string) => {
    onClose();
    router.push({ pathname: "/vehicle/[id]/add-log", params: { id: vehicle.id, serviceTypeId } });
  };

  const serviceRows = (list: Pick<ZoneService, "serviceTypeId" | "name" | "status" | "message">[]) =>
    list.length === 0 ? (
      <Text style={[styles.sheetEmpty, { color: colors.textSecondary }]}>No service types here yet</Text>
    ) : (
      list.map((s) => (
        <View key={s.serviceTypeId} style={[styles.sheetRow, { borderBottomColor: colors.border }]}>
          <StatusDot status={s.status === "Overdue" ? "overdue" : s.status === "Upcoming" ? "soon" : s.status === "OK" ? "ok" : "none"} />
          <View style={styles.flex}>
            <Text style={[styles.rowName, { color: colors.text }]}>{s.name}</Text>
            <Text style={[styles.sheetMsg, { color: colors.textSecondary }]}>
              {s.status === "NeverDone" || s.status === "NoInterval" ? STATUS_LABEL[s.status] : `${STATUS_LABEL[s.status]} · ${s.message}`}
            </Text>
          </View>
          <Button label="Log" variant="outline" onPress={() => log(s.serviceTypeId)} style={styles.logButton} />
        </View>
      ))
    );

  if (target.zone === "parts") {
    const zones = ([...Object.keys(art.zones), "whole", "other"] as ZoneId[]).filter((z) => (groups[z]?.length ?? 0) > 0 || z in art.zones);
    return (
      <Sheet visible title="Parts" subtitle={name} onClose={onClose}>
        <PartsList groups={groups} zones={zones} labels={art.labels} />
      </Sheet>
    );
  }
  if (target.zone === "due") {
    return (
      <Sheet visible title="Due" subtitle={name} onClose={onClose}>
        {serviceRows(due.map((d) => ({ serviceTypeId: d.serviceTypeId, name: d.serviceTypeName, status: d.status, message: d.message })))}
      </Sheet>
    );
  }
  const zone = target.zone;
  const title = (zone in art.labels ? art.labels[zone as DrawnZoneId] : undefined) ?? ZONE_LABEL[zone];
  const list = [...groups[zone]].sort((a, b) => rank(a.status) - rank(b.status));
  return (
    <Sheet visible title={title} subtitle={name} onClose={onClose}>
      {serviceRows(list)}
    </Sheet>
  );
}

const rank = (s: string) => (s === "Overdue" ? 0 : s === "Upcoming" ? 1 : 2);

function PartsList({ groups, zones, labels }: { groups: Record<ZoneId, ZoneService[]>; zones: ZoneId[]; labels: Partial<Record<DrawnZoneId, string>> }) {
  const { colors } = useTheme();
  const [open, setOpen] = useState<ZoneId | null>(null);
  return (
    <View>
      {zones.map((z) => {
        const status = zoneStatus(groups[z]);
        const title = ((labels as Record<string, string>)[z] ?? ZONE_LABEL[z]) + ` (${groups[z].length})`;
        return (
          <View key={z}>
            <Pressable accessibilityRole="button" accessibilityState={{ expanded: open === z }} onPress={() => setOpen(open === z ? null : z)} style={[styles.sheetRow, { borderBottomColor: colors.border }]}>
              <StatusDot status={status} />
              <Text style={[styles.rowName, styles.flex, { color: colors.text }]}>{title}</Text>
              <Icon name={open === z ? "chevronDown" : "chevron"} color={colors.textMuted} size={16} />
            </Pressable>
            {open === z &&
              groups[z].map((s) => (
                <Text key={s.serviceTypeId} style={[styles.partItem, { color: colors.textSecondary }]}>
                  {s.name} · {STATUS_LABEL[s.status]}
                </Text>
              ))}
          </View>
        );
      })}
    </View>
  );
}

/** The vehicles that are not on the deck, searchable. Tapping one opens it. */
export function OthersSheet({ vehicles, visible, onClose }: { vehicles: VehicleRead[]; visible: boolean; onClose: () => void }) {
  const { colors } = useTheme();
  const router = useRouter();
  const units = useUnits();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? vehicles.filter((v) => `${v.make} ${v.model} ${v.vin ?? ""}`.toLowerCase().includes(q)) : vehicles;
  }, [vehicles, query]);
  return (
    <Sheet visible={visible} title="Other vehicles" onClose={onClose}>
      {vehicles.length > 5 && (
        <TextInput
          style={[styles.search, { backgroundColor: colors.raised, color: colors.text, borderColor: colors.border }]}
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={colors.textMuted}
          accessibilityLabel="Search other vehicles"
        />
      )}
      {shown.map((v) => (
        <Pressable
          key={v.id}
          accessibilityRole="button"
          onPress={() => {
            onClose();
            router.push(`/vehicle/${v.id}`);
          }}
          style={[styles.sheetRow, { borderBottomColor: colors.border }]}
        >
          <OtherStatus vehicle={v} />
          <Text style={[styles.rowName, styles.flex, { color: colors.text }]} numberOfLines={1}>{v.make} {v.model}</Text>
          <Text style={[styles.sheetMsg, figures, { color: colors.textMuted }]}>{v.current_mileage != null ? units.distance(v.current_mileage) : ""}</Text>
        </Pressable>
      ))}
    </Sheet>
  );
}

function OtherStatus({ vehicle }: { vehicle: VehicleRead }) {
  const { due } = useGarageData(vehicle);
  return <StatusDot status={due.some((d) => d.status === "Overdue") ? "overdue" : due.length ? "soon" : "ok"} />;
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { borderRadius: 24, borderWidth: 1, overflow: "hidden" },
  cardBody: { padding: 16, paddingBottom: 20 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: 12, minHeight: 48 },
  name: { fontSize: 20, fontWeight: "600" },
  sub: { fontSize: 12, marginTop: 2 },
  odo: { alignItems: "flex-end" },
  odoValue: { fontSize: 17, fontWeight: "600" },
  outline: { marginTop: 8, marginBottom: 4 },
  summary: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, marginBottom: 4 },
  summaryText: { fontSize: 13, fontWeight: "500" },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
  rowName: { fontSize: 15, fontWeight: "500" },
  rowMsg: { fontSize: 12, flexShrink: 1, marginLeft: "auto" },
  hint: { fontSize: 14, marginTop: 16, lineHeight: 20 },
  visitDate: { fontSize: 12, minWidth: 86 },
  sectionLabel: { fontSize: 12, fontWeight: "600", marginTop: 12, marginBottom: 2 },
  more: { minHeight: 44, justifyContent: "center", paddingLeft: 18 },
  moreText: { fontSize: 13, fontWeight: "600" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  chip: { minHeight: 44, borderRadius: 12, borderWidth: 1, paddingHorizontal: 14, alignItems: "center", justifyContent: "center" },
  chipText: { fontSize: 13, fontWeight: "500" },
  empty: { borderRadius: 24, borderWidth: 1, padding: 20, margin: 16 },
  emptyTitle: { fontSize: 20, fontWeight: "600", marginTop: 12, textAlign: "center" },
  emptyBody: { fontSize: 14, marginTop: 6, textAlign: "center" },
  emptyButton: { marginTop: 16 },
  sheetRow: { minHeight: 56, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  sheetMsg: { fontSize: 12, marginTop: 2 },
  sheetEmpty: { fontSize: 14, paddingVertical: 20, textAlign: "center" },
  logButton: { minWidth: 64, paddingHorizontal: 12 },
  partItem: { fontSize: 13, paddingLeft: 18, paddingVertical: 6 },
  search: { minHeight: 48, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, fontSize: 15, marginBottom: 8 },
});
