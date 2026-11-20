import { Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { SymbolView } from "expo-symbols";
import { Text } from "@/components/Themed";
import { TOUCH, useTheme } from "@/src/theme";

type IconName = "close" | "check" | "add" | "warning" | "chevron" | "chevronLeft" | "chevronDown" | "calendar" | "search" | "up" | "down" | "arrange";

const SYMBOLS = {
  close: { ios: "xmark", android: "close", web: "close" },
  check: { ios: "checkmark", android: "check", web: "check" },
  add: { ios: "plus", android: "add", web: "add" },
  warning: { ios: "exclamationmark.triangle", android: "warning", web: "warning" },
  chevron: { ios: "chevron.right", android: "chevron_right", web: "chevron_right" },
  chevronLeft: { ios: "chevron.left", android: "chevron_left", web: "chevron_left" },
  chevronDown: { ios: "chevron.down", android: "keyboard_arrow_down", web: "keyboard_arrow_down" },
  calendar: { ios: "calendar", android: "calendar_today", web: "calendar_today" },
  search: { ios: "magnifyingglass", android: "search", web: "search" },
  up: { ios: "arrow.up", android: "arrow_upward", web: "arrow_upward" },
  down: { ios: "arrow.down", android: "arrow_downward", web: "arrow_downward" },
  arrange: { ios: "arrow.up.arrow.down", android: "swap_vert", web: "swap_vert" },
} as const;

/** One icon set at one size, taking its colour from the text role it sits in. */
export function Icon({ name, color, size = 18 }: { name: IconName; color: string; size?: number }) {
  return <SymbolView name={SYMBOLS[name]} tintColor={color} size={size} />;
}

/** Icon-only control: 48dp target, label required for screen readers. */
export function IconButton({
  name,
  label,
  onPress,
  color,
  disabled,
  style,
}: {
  name: IconName;
  label: string;
  onPress: () => void;
  color?: string;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.iconButton, pressed && { backgroundColor: colors.raised }, disabled && { opacity: 0.3 }, style]}
    >
      <Icon name={name} color={color ?? colors.textSecondary} />
    </Pressable>
  );
}

/** Pressable with a pressed state and role; replaces TouchableOpacity. */
export function Button({
  label,
  onPress,
  variant = "primary",
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "outline" | "danger";
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const bg = variant === "primary" ? colors.primary : "transparent";
  const fg = variant === "primary" ? colors.onPrimary : variant === "danger" ? colors.danger : colors.text;
  const border = variant === "primary" ? colors.primary : colors.border;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled || !!loading, busy: !!loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: border, opacity: disabled ? 0.5 : pressed ? 0.85 : 1 },
        pressed && { transform: [{ scale: 0.98 }] },
        style,
      ]}
    >
      <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

/** Status dot (the signature): red overdue, amber due soon, nothing otherwise. */
/** `none` is a quiet grey dot: nothing to report (no record yet, no interval). */
export function StatusDot({ status }: { status: "overdue" | "soon" | "ok" | "none" }) {
  const { colors } = useTheme();
  const color = status === "overdue" ? colors.danger : status === "soon" ? colors.warn : status === "ok" ? colors.ok : colors.textMuted;
  return <View style={[styles.dot, { backgroundColor: color }]} />;
}

const styles = StyleSheet.create({
  iconButton: { minWidth: TOUCH, minHeight: TOUCH, alignItems: "center", justifyContent: "center", borderRadius: TOUCH / 2 },
  button: {
    minHeight: TOUCH,
    borderRadius: 12,
    borderWidth: 1,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: { fontSize: 15, fontWeight: "600" },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
