import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Circle, G, Line, Path } from "react-native-svg";
import {
  FRAME,
  SILHOUETTES,
  sportSpokes,
  ZONE_LABEL,
  zoneStatus,
  type BodyTypeId,
  type DrawnZoneId,
  type Hit,
  type ZoneId,
  type ZoneService,
} from "@carbaddie/core";
import { useTheme } from "@/src/theme";

/**
 * A vehicle drawn as a line outline. Parts with something overdue get a red tint and a solid
 * badge, parts due soon an amber tint and a ring badge: the shape differs as well as the
 * colour, because the outline's own colour is a choice and may sit close to a status colour.
 * Tapping a part reports it. The taps are real buttons laid over the drawing (not shapes inside
 * it), so they work the same everywhere and each has a spoken name and status.
 */
export function VehicleOutline({
  bodyType,
  zones,
  onZone,
  dashed,
}: {
  bodyType: BodyTypeId;
  zones: Record<ZoneId, ZoneService[]>;
  onZone?: (zone: DrawnZoneId) => void;
  /** The empty-garage drawing: no status, muted and dashed. */
  dashed?: boolean;
}) {
  const { colors } = useTheme();
  const [width, setWidth] = useState(0);
  const art = SILHOUETTES[bodyType];
  const stroke = dashed ? colors.textMuted : colors.outline;
  const dash = dashed ? "5 5" : undefined;
  const entries = Object.entries(art.zones) as [DrawnZoneId, NonNullable<(typeof art.zones)[DrawnZoneId]>][];

  return (
    <View style={styles.box} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      <View style={StyleSheet.absoluteFill} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" pointerEvents="none">
      <Svg width="100%" height="100%" viewBox={FRAME.viewBox}>
        <Line x1={20} y1={FRAME.groundY} x2={300} y2={FRAME.groundY} stroke={colors.border} strokeWidth={1} strokeDasharray="3 4" />

        {!dashed &&
          entries.map(([zone, z]) => {
            const status = zoneStatus(zones[zone] ?? []);
            if (status === "ok") return null;
            const fill = status === "overdue" ? colors.danger : colors.warn;
            return (
              <G key={`tint-${zone}`} opacity={0.26}>
                {z.tint.map((d, i) => <Path key={i} d={d} fill={fill} />)}
                {z.tintCircles.map(([cx, cy, r], i) => <Circle key={`c${i}`} cx={cx} cy={cy} r={r} fill={fill} />)}
              </G>
            );
          })}

        <Path d={art.outline} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />
        <Path d={art.detail} fill="none" stroke={stroke} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} strokeDasharray={dash} />
        {art.faint ? <Path d={art.faint} fill="none" stroke={stroke} strokeWidth={1} strokeLinecap="round" opacity={0.4} /> : null}

        {art.wheels.map((w, i) => (
          <G key={`wheel-${i}`}>
            <Circle cx={w.cx} cy={w.cy} r={w.r} fill={colors.card} stroke={stroke} strokeWidth={2} strokeDasharray={dash} />
            {w.style === "sport" ? (
              <>
                <Circle cx={w.cx} cy={w.cy} r={w.r * 0.74} fill="none" stroke={stroke} strokeWidth={1.4} />
                <Circle cx={w.cx} cy={w.cy} r={w.r * 0.16} fill="none" stroke={stroke} strokeWidth={1.3} />
                <Path d={sportSpokes(w.cx, w.cy, w.r)} fill="none" stroke={stroke} strokeWidth={1.4} strokeLinecap="round" />
              </>
            ) : (
              <Circle cx={w.cx} cy={w.cy} r={w.r * 0.42} fill="none" stroke={stroke} strokeWidth={1.5} />
            )}
          </G>
        ))}

        {!dashed &&
          entries.map(([zone, z]) => {
            const status = zoneStatus(zones[zone] ?? []);
            if (status === "ok") return null;
            const [x, y] = z.badge;
            return status === "overdue" ? (
              <G key={`badge-${zone}`}>
                <Circle cx={x} cy={y} r={9} fill={colors.danger} />
                <Path d={`M${x} ${y - 4.5} L${x} ${y + 1}`} stroke={colors.card} strokeWidth={2} strokeLinecap="round" />
                <Circle cx={x} cy={y + 4.2} r={1.2} fill={colors.card} />
              </G>
            ) : (
              <G key={`badge-${zone}`}>
                <Circle cx={x} cy={y} r={8.5} fill={colors.card} stroke={colors.warn} strokeWidth={2.2} />
                <Path d={`M${x} ${y - 4} L${x} ${y} L${x + 3} ${y + 2}`} fill="none" stroke={colors.warn} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              </G>
            );
          })}

      </Svg>
      </View>

      {onZone && width > 0 &&
        entries.flatMap(([zone, z]) =>
          z.hits.map((h: Hit, i) => {
            const k = width / FRAME.width;
            const [x0, y0, w, hgt] = h.shape === "rect" ? [h.x, h.y, h.w, h.h] : [h.cx - h.r, h.cy - h.r, h.r * 2, h.r * 2];
            const status = zoneStatus(zones[zone] ?? []);
            const name = (art.labels[zone] ?? ZONE_LABEL[zone]) + (status === "overdue" ? ", overdue" : status === "soon" ? ", due soon" : ", on track");
            return (
              <Pressable
                key={`${zone}-${i}`}
                accessibilityRole="button"
                accessibilityLabel={name}
                onPress={() => onZone(zone)}
                style={{ position: "absolute", left: (x0 - 30) * k, top: (y0 - 24) * k, width: w * k, height: hgt * k, borderRadius: h.shape === "circle" ? (w * k) / 2 : 8 * k }}
              />
            );
          }),
        )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { width: "100%", aspectRatio: FRAME.width / FRAME.height },
});
