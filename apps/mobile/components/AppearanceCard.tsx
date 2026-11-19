import { Pressable, StyleSheet, View } from "react-native";
import { ACCENTS, accentColor, type ThemeMode } from "@carbaddie/core";
import { Text } from "@/components/Themed";
import { Icon } from "@/components/Controls";
import { TOUCH, useTheme } from "@/src/theme";
import { setAccent, setMode, useAppearance } from "@/src/appearance";

const MODES: { value: ThemeMode; label: string }[] = [
  { value: "light", label: "Light" },
  { value: "dark", label: "Dark" },
  { value: "system", label: "System" },
];

/** Mode and accent, the same choices as the desktop Appearance settings. */
export function AppearanceCard() {
  const { colors, dark } = useTheme();
  const { mode, accent } = useAppearance();
  const scheme = dark ? "dark" : "light";
  const accentLabel = ACCENTS.find((a) => a.id === accent)?.label.toLowerCase();

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Text style={[styles.label, { color: colors.text }]}>Mode</Text>
      <Text style={[styles.desc, { color: colors.textMuted }]}>Light, dark, or follow your phone</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="Colour mode"
        style={[styles.track, { backgroundColor: colors.raised, borderColor: colors.border }]}
      >
        {MODES.map((m) => {
          const selected = mode === m.value;
          return (
            <Pressable
              key={m.value}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              onPress={() => setMode(m.value)}
              style={[styles.segment, selected && { backgroundColor: colors.primary }]}
            >
              <Text style={[styles.segmentText, { color: selected ? colors.onPrimary : colors.text }]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>

      <View style={[styles.divider, { borderTopColor: colors.border }]} />

      <Text style={[styles.label, { color: colors.text }]}>Accent</Text>
      <Text style={[styles.desc, { color: colors.textMuted }]}>
        Active tab, links and switches. Currently {accentLabel}
      </Text>
      <View accessibilityRole="radiogroup" accessibilityLabel="Accent colour" style={styles.swatches}>
        {ACCENTS.map((a) => {
          const selected = a.id === accent;
          return (
            <Pressable
              key={a.id}
              accessibilityRole="radio"
              accessibilityLabel={a.label}
              accessibilityState={{ selected }}
              onPress={() => setAccent(a.id)}
              style={[styles.swatchHit, selected && { borderColor: colors.text }]}
            >
              <View style={[styles.swatch, { backgroundColor: accentColor(a.id, scheme) }]}>
                {selected && <Icon name="check" color={colors.card} size={16} />}
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 14, borderWidth: 1, padding: 16 },
  label: { fontSize: 13, fontWeight: "600" },
  desc: { fontSize: 12, marginTop: 2, marginBottom: 12 },
  track: { flexDirection: "row", borderRadius: 12, borderWidth: 1, padding: 3 },
  segment: { flex: 1, minHeight: 44, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  segmentText: { fontSize: 14, fontWeight: "600" },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, marginVertical: 16 },
  swatches: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  swatchHit: { width: TOUCH, height: TOUCH, borderRadius: TOUCH / 2, borderWidth: 2, borderColor: "transparent", alignItems: "center", justifyContent: "center" },
  swatch: { width: 32, height: 32, borderRadius: 16, alignItems: "center", justifyContent: "center" },
});
