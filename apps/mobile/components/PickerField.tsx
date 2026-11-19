import { useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Text } from "@/components/Themed";
import { Icon } from "@/components/Controls";
import { TOUCH, useTheme } from "@/src/theme";

export type PickerOption = { value: string; label: string; hint?: string };

/**
 * Choose one option from a list that can be long. Shows the current choice in a field and opens a
 * bottom sheet with search (when there are many options), so nothing has to be swiped sideways.
 */
export function PickerField({
  value,
  options,
  onChange,
  title,
  placeholder = "Select",
  allowClear,
  clearLabel = "None",
  style,
}: {
  value: string | null;
  options: PickerOption[];
  onChange: (value: string | null) => void;
  /** Sheet title and the field's spoken name, e.g. "Service type". */
  title: string;
  placeholder?: string;
  allowClear?: boolean;
  clearLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const current = options.find((o) => o.value === value);
  const searchable = options.length > 8;

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  const close = () => {
    setOpen(false);
    setQuery("");
  };
  const choose = (v: string | null) => {
    onChange(v);
    close();
  };

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${title}, ${current ? current.label : "not set"}`}
        accessibilityHint="Opens a list"
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.field,
          { backgroundColor: colors.card, borderColor: colors.border },
          pressed && { backgroundColor: colors.raised },
          style,
        ]}
      >
        <Text style={[styles.fieldText, { color: current ? colors.text : colors.textMuted }]} numberOfLines={1}>
          {current ? current.label : placeholder}
        </Text>
        <Icon name="chevronDown" color={colors.textMuted} size={18} />
      </Pressable>

      <Modal visible={open} transparent animationType="slide" onRequestClose={close}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.fill}>
          <Pressable style={styles.backdrop} onPress={close} accessibilityRole="button" accessibilityLabel="Close list" />
          <View
            accessibilityViewIsModal
            style={[styles.sheet, { backgroundColor: colors.card, borderColor: colors.border, paddingBottom: insets.bottom + 8 }]}
          >
            <View style={[styles.grabber, { backgroundColor: colors.border }]} />
            <Text style={[styles.title, { color: colors.text }]} accessibilityRole="header">{title}</Text>
            {searchable && (
              <View style={[styles.search, { backgroundColor: colors.raised, borderColor: colors.border }]}>
                <Icon name="search" color={colors.textMuted} size={16} />
                <TextInput
                  style={[styles.searchInput, { color: colors.text }]}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search"
                  placeholderTextColor={colors.textMuted}
                  autoCorrect={false}
                  accessibilityLabel={`Search ${title.toLowerCase()}`}
                />
              </View>
            )}
            <FlatList
              data={shown}
              keyExtractor={(o) => o.value}
              keyboardShouldPersistTaps="handled"
              ListHeaderComponent={
                allowClear && !query ? (
                  <Row label={clearLabel} muted selected={value === null} onPress={() => choose(null)} />
                ) : undefined
              }
              ListEmptyComponent={<Text style={[styles.empty, { color: colors.textSecondary }]}>Nothing matches</Text>}
              renderItem={({ item }) => (
                <Row label={item.label} hint={item.hint} selected={item.value === value} onPress={() => choose(item.value)} />
              )}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function Row({ label, hint, selected, muted, onPress }: { label: string; hint?: string; selected: boolean; muted?: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { borderBottomColor: colors.border }, pressed && { backgroundColor: colors.raised }]}
    >
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, { color: muted ? colors.textSecondary : colors.text, fontWeight: selected ? "600" : "400" }]}>{label}</Text>
        {hint ? <Text style={[styles.rowHint, { color: colors.textMuted }]}>{hint}</Text> : null}
      </View>
      {selected && <Icon name="check" color={colors.text} size={18} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: "flex-end" },
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(0,0,0,0.5)" },
  field: {
    minHeight: TOUCH,
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  fieldText: { fontSize: 15, flex: 1 },
  sheet: { maxHeight: "75%", borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderBottomWidth: 0, paddingHorizontal: 16, paddingTop: 8 },
  grabber: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, marginBottom: 8 },
  title: { fontSize: 17, fontWeight: "600", marginBottom: 12 },
  search: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, marginBottom: 8 },
  searchInput: { flex: 1, minHeight: TOUCH, fontSize: 15 },
  row: { minHeight: TOUCH, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8, borderBottomWidth: StyleSheet.hairlineWidth, paddingVertical: 8 },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15 },
  rowHint: { fontSize: 12, marginTop: 2 },
  empty: { textAlign: "center", paddingVertical: 24, fontSize: 14 },
});
