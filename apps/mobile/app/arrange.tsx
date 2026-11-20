import { useMemo } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { moveInGarage, splitGarage } from "@carbaddie/core";
import { Text } from "@/components/Themed";
import { IconButton } from "@/components/Controls";
import { TOUCH, useTheme } from "@/src/theme";
import { useGarageOrder, useSetGarageOrder, useVehicles } from "@/src/hooks/useDatabase";
import type { VehicleRead } from "@/src/types";

/**
 * Arrange the garage: the order of the deck cards and of the other vehicles. The order is a synced
 * preference, so the desktop shows the same. What is on the deck stays the favourite switch's job.
 */
export default function ArrangeScreen() {
  const { colors } = useTheme();
  const { data: vehicles = [] } = useVehicles();
  const { data: order = [] } = useGarageOrder();
  const setOrder = useSetGarageOrder();
  const garage = useMemo(() => splitGarage(vehicles, order), [vehicles, order]);

  const move = (id: string, step: -1 | 1) => {
    const next = moveInGarage(garage, id, step);
    if (next) setOrder.mutate(next);
  };

  const group = (title: string, list: VehicleRead[]) =>
    list.length > 0 && (
      <View style={styles.group}>
        <Text style={[styles.groupTitle, { color: colors.textSecondary }]}>{title}</Text>
        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {list.map((v, i) => {
            const name = `${v.make} ${v.model}`;
            return (
              <View key={v.id} style={[styles.row, i > 0 && { borderTopColor: colors.border, borderTopWidth: StyleSheet.hairlineWidth }]}>
                <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>{name}</Text>
                <IconButton name="up" label={`Move ${name} earlier`} color={colors.text} disabled={i === 0} onPress={() => move(v.id, -1)} />
                <IconButton name="down" label={`Move ${name} later`} color={colors.text} disabled={i === list.length - 1} onPress={() => move(v.id, 1)} />
              </View>
            );
          })}
        </View>
      </View>
    );

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <Text style={[styles.hint, { color: colors.textMuted }]}>
        The first card is the one the garage opens on. The order is the same on all your devices.
      </Text>
      {group("Garage deck", garage.deck)}
      {group("Other vehicles", garage.others)}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 20 },
  hint: { fontSize: 13 },
  group: { gap: 8 },
  groupTitle: { fontSize: 13, fontWeight: "600" },
  card: { borderRadius: 14, borderWidth: 1, paddingLeft: 14, paddingRight: 4 },
  row: { minHeight: TOUCH + 8, flexDirection: "row", alignItems: "center" },
  name: { flex: 1, fontSize: 15, fontWeight: "500" },
});
