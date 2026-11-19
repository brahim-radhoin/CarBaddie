import { Pressable, StyleSheet, View } from "react-native";
import { BODY_TYPES } from "@carbaddie/core";
import { Text } from "@/components/Themed";
import { TOUCH, useTheme } from "@/src/theme";

/** Which kind of vehicle it is, which picks the outline the garage draws. */
export function BodyTypePicker({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { colors } = useTheme();
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel="Vehicle type" style={styles.row}>
      {BODY_TYPES.map((t) => {
        const selected = t.id === value;
        return (
          <Pressable
            key={t.id}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(t.id)}
            style={[styles.option, { borderColor: selected ? colors.primary : colors.border, backgroundColor: selected ? colors.primary : colors.card }]}
          >
            <Text style={[styles.text, { color: selected ? colors.onPrimary : colors.text }]}>{t.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  option: { minHeight: TOUCH, borderWidth: 1, borderRadius: 12, paddingHorizontal: 16, alignItems: "center", justifyContent: "center" },
  text: { fontSize: 14, fontWeight: "600" },
});
