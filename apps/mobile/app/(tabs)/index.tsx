import { useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useRouter } from "expo-router";
import { splitGarage } from "@carbaddie/core";
import { Text } from "@/components/Themed";
import { Button, Icon } from "@/components/Controls";
import { EmptyGarage, GarageCard, OthersSheet, ServicesSheet, type SheetTarget } from "@/components/Garage";
import { useTheme } from "@/src/theme";
import { useVehicles } from "@/src/hooks/useDatabase";
import type { VehicleRead } from "@/src/types";

const GAP = 10;
const SIDE = 16;

type DeckItem = { kind: "vehicle"; vehicle: VehicleRead } | { kind: "add" };

/**
 * The home screen: your favourite vehicles as big cards you swipe between, the rest behind one
 * row above them, and Add visit always at the bottom for the card in view.
 */
export default function GarageScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { data: vehicles = [], isLoading } = useVehicles();
  const { deck, others } = useMemo(() => splitGarage(vehicles), [vehicles]);

  const [index, setIndex] = useState(0);
  const [areaHeight, setAreaHeight] = useState(0);
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  const [othersOpen, setOthersOpen] = useState(false);

  const several = deck.length > 1;
  const cardWidth = several ? Math.round(width * 0.86) : width - SIDE * 2;
  const interval = cardWidth + GAP;
  const cardHeight = Math.max(0, areaHeight - (several ? 28 : 12) - 8);
  const current = deck[Math.min(index, Math.max(0, deck.length - 1))];

  const data: DeckItem[] = [...deck.map((vehicle): DeckItem => ({ kind: "vehicle", vehicle })), ...(several ? [{ kind: "add" } as DeckItem] : [])];

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setIndex(Math.min(deck.length - 1, Math.max(0, Math.round(e.nativeEvent.contentOffset.x / interval))));
  };

  if (!isLoading && vehicles.length === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <EmptyGarage onAdd={() => router.push("/vehicle/new")} />
      </View>
    );
  }

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      {others.length > 0 && (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${others.length} other vehicles`}
          onPress={() => setOthersOpen(true)}
          style={({ pressed }) => [styles.others, { backgroundColor: pressed ? colors.raised : colors.card, borderColor: colors.border }]}
        >
          <Text style={[styles.othersText, { color: colors.text }]}>{others.length} other {others.length === 1 ? "vehicle" : "vehicles"}</Text>
          <Icon name="chevron" color={colors.textMuted} size={16} />
        </Pressable>
      )}

      <View style={styles.area} onLayout={(e) => setAreaHeight(e.nativeEvent.layout.height)}>
        {areaHeight > 0 && deck.length > 0 && (
          <FlatList
            horizontal
            data={data}
            keyExtractor={(item) => (item.kind === "vehicle" ? item.vehicle.id : "add")}
            showsHorizontalScrollIndicator={false}
            snapToInterval={interval}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum
            onMomentumScrollEnd={onScrollEnd}
            contentContainerStyle={{ paddingHorizontal: SIDE, paddingTop: 6, gap: GAP }}
            renderItem={({ item }) =>
              item.kind === "vehicle" ? (
                <GarageCard vehicle={item.vehicle} width={cardWidth} height={cardHeight} onSheet={setSheet} />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Add vehicle"
                  onPress={() => router.push("/vehicle/new")}
                  style={[styles.ghost, { width: Math.round(width * 0.4), height: cardHeight, borderColor: colors.border }]}
                >
                  <Icon name="add" color={colors.textSecondary} size={24} />
                  <Text style={[styles.ghostText, { color: colors.textSecondary }]}>Add vehicle</Text>
                </Pressable>
              )
            }
          />
        )}
        {several && (
          <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {deck.map((v, i) => (
              <View key={v.id} style={[styles.dot, { backgroundColor: colors.text, opacity: i === index ? 1 : 0.3 }]} />
            ))}
          </View>
        )}
      </View>

      {current && (
        <View style={[styles.bar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
          <Button label={`Add visit · ${current.make} ${current.model}`} onPress={() => router.push(`/vehicle/${current.id}/add-log`)} />
        </View>
      )}

      <ServicesSheet target={sheet} onClose={() => setSheet(null)} />
      <OthersSheet vehicles={others} visible={othersOpen} onClose={() => setOthersOpen(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  others: { minHeight: 48, marginHorizontal: SIDE, marginTop: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  othersText: { fontSize: 14, fontWeight: "500" },
  area: { flex: 1, paddingTop: 6 },
  ghost: { borderRadius: 24, borderWidth: 1, borderStyle: "dashed", alignItems: "center", justifyContent: "center", gap: 6 },
  ghostText: { fontSize: 14, fontWeight: "500" },
  dots: { height: 20, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 3.5 },
  bar: { padding: 12, paddingHorizontal: SIDE, borderTopWidth: StyleSheet.hairlineWidth },
});
