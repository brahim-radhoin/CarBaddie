import { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Pressable, StyleSheet, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useReducedMotion } from "react-native-reanimated";
import { useRouter } from "expo-router";
import { splitGarage } from "@carbaddie/core";
import { Text } from "@/components/Themed";
import { Button, Icon } from "@/components/Controls";
import { EmptyGarage, GarageCard, OthersSheet, ServicesSheet, type SheetTarget } from "@/components/Garage";
import { useTheme } from "@/src/theme";
import { useAppearance } from "@/src/appearance";
import { useGarageOrder, useVehicles } from "@/src/hooks/useDatabase";
import type { VehicleRead } from "@/src/types";

const GAP = 10;
const SIDE = 16;
/**
 * A looping deck is the deck repeated this many times, opened in the middle: hundreds of swipes
 * either way before an end, with no jump to hide (and only the cards near the one in view exist).
 */
const LOOP_ROUNDS = 400;

type DeckItem = { kind: "vehicle"; vehicle: VehicleRead; key: string } | { kind: "add"; key: string };

/**
 * The home screen: your favourite vehicles as big cards you swipe between, the rest behind one
 * row above them, and Add visit always at the bottom for the card in view. With "Loop the garage
 * deck" on (Appearance), the cards go round and ease in size and opacity as they pass the centre.
 */
export default function GarageScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { data: vehicles = [], isLoading } = useVehicles();
  const { data: order = [] } = useGarageOrder();
  const { deck, others } = useMemo(() => splitGarage(vehicles, order), [vehicles, order]);
  const { loopDeck } = useAppearance();
  const reduceMotion = useReducedMotion();

  const [areaHeight, setAreaHeight] = useState(0);
  const [sheet, setSheet] = useState<SheetTarget | null>(null);
  const [othersOpen, setOthersOpen] = useState(false);

  const n = deck.length;
  const several = n > 1;
  const loop = loopDeck && several;
  const animate = loop && !reduceMotion;
  const cardWidth = several ? Math.round(width * 0.86) : width - SIDE * 2;
  const interval = cardWidth + GAP;
  // Looping cards sit in the middle, so the neighbours peek in on both sides.
  const sidePad = loop ? Math.round((width - cardWidth) / 2) : SIDE;
  const cardHeight = Math.max(0, areaHeight - (several ? 28 : 12) - 8);
  const start = loop ? n * Math.floor(LOOP_ROUNDS / 2) : 0;

  // The card in view, as a position in the list (it repeats the deck when looping).
  const [position, setPosition] = useState(start);
  const positionRef = useRef(start);
  const scrollX = useRef(new Animated.Value(start * interval)).current;

  const index = loop ? ((position % n) + n) % n : Math.min(position, Math.max(0, n - 1));
  const current = deck[index];
  const indexRef = useRef(index);
  indexRef.current = index;
  // A looping list is rebuilt (see its key) when it starts, the deck size changes or the phone turns:
  // it opens on the same card, in the middle of the repeats.
  const opening = loop ? start + Math.min(index, n - 1) : 0;
  useEffect(() => {
    const p = loop ? start + Math.min(indexRef.current, n - 1) : 0;
    positionRef.current = p;
    setPosition(p);
    scrollX.setValue(p * interval);
  }, [loop, start, n, interval, scrollX]);

  const data: DeckItem[] = useMemo(() => {
    if (loop) return Array.from({ length: n * LOOP_ROUNDS }, (_, i) => ({ kind: "vehicle" as const, vehicle: deck[i % n], key: `${deck[i % n].id}-${i}` }));
    return [
      ...deck.map((vehicle): DeckItem => ({ kind: "vehicle", vehicle, key: vehicle.id })),
      ...(several ? [{ kind: "add", key: "add" } as DeckItem] : []),
    ];
  }, [deck, loop, n, several]);

  // Tracks the card in view while scrolling (momentum end alone is unreliable on web).
  const onScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], {
        useNativeDriver: true,
        listener: (e: NativeSyntheticEvent<NativeScrollEvent>) => {
          const p = Math.max(0, Math.round(e.nativeEvent.contentOffset.x / interval));
          if (p !== positionRef.current) {
            positionRef.current = p;
            setPosition(p);
          }
        },
      }),
    [scrollX, interval]
  );

  // The dots follow the scroll too: the deck's position within one round of it.
  const round = useMemo(() => (loop ? Animated.modulo(scrollX, n * interval) : null), [loop, scrollX, n, interval]);

  if (!isLoading && vehicles.length === 0) {
    return (
      <View style={[styles.screen, { backgroundColor: colors.background }]}>
        <EmptyGarage onAdd={() => router.push("/vehicle/new")} />
      </View>
    );
  }

  const renderCard = (item: DeckItem, i: number) => {
    if (item.kind === "add") {
      return (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Add vehicle"
          onPress={() => router.push("/vehicle/new")}
          style={[styles.ghost, { width: Math.round(width * 0.4), height: cardHeight, borderColor: colors.border }]}
        >
          <Icon name="add" color={colors.textSecondary} size={24} />
          <Text style={[styles.ghostText, { color: colors.textSecondary }]}>Add vehicle</Text>
        </Pressable>
      );
    }
    const card = <GarageCard vehicle={item.vehicle} width={cardWidth} height={cardHeight} onSheet={setSheet} />;
    if (!animate) return card;
    // Subtle: the card in view is full size, its neighbours a little smaller and dimmer.
    const inputRange = [(i - 1) * interval, i * interval, (i + 1) * interval];
    const scale = scrollX.interpolate({ inputRange, outputRange: [0.93, 1, 0.93], extrapolate: "clamp" });
    const opacity = scrollX.interpolate({ inputRange, outputRange: [0.6, 1, 0.6], extrapolate: "clamp" });
    return <Animated.View style={{ opacity, transform: [{ scale }] }}>{card}</Animated.View>;
  };

  const dot = (k: number) => {
    if (!round || reduceMotion) return { opacity: k === index ? 1 : 0.3 };
    // Dot k is lit at k × interval; dot 0 also as the round wraps back to it.
    const at = k * interval;
    const inputRange = k === 0 ? [0, interval, (n - 1) * interval, n * interval] : [at - interval, at, at + interval];
    const lit = k === 0 ? [1, 0, 0, 1] : [0, 1, 0];
    return {
      opacity: round.interpolate({ inputRange, outputRange: lit.map((v) => 0.3 + 0.7 * v), extrapolate: "clamp" }),
      transform: [{ scale: round.interpolate({ inputRange, outputRange: lit.map((v) => 1 + 0.35 * v), extrapolate: "clamp" }) }],
    };
  };

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
        {areaHeight > 0 && n > 0 && (
          <Animated.FlatList
            // A new list when looping starts or stops, or the deck size changes: it opens in the middle again.
            key={loop ? `loop-${n}-${interval}` : "deck"}
            horizontal
            data={data}
            keyExtractor={(item) => item.key}
            showsHorizontalScrollIndicator={false}
            snapToInterval={interval}
            snapToAlignment="start"
            decelerationRate="fast"
            disableIntervalMomentum
            onScroll={onScroll}
            scrollEventThrottle={16}
            {...(loop
              ? {
                  getItemLayout: (_: unknown, i: number) => ({ length: interval, offset: interval * i, index: i }),
                  initialScrollIndex: opening,
                  initialNumToRender: 3,
                  maxToRenderPerBatch: 3,
                  windowSize: 5,
                }
              : {})}
            contentContainerStyle={{ paddingHorizontal: sidePad, paddingTop: 6, gap: GAP }}
            renderItem={({ item, index: i }) => renderCard(item, i)}
          />
        )}
        {several && (
          <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
            {deck.map((v, k) => (
              <Animated.View key={v.id} style={[styles.dot, { backgroundColor: colors.text }, dot(k)]} />
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
