import { useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { Text } from "@/components/Themed";
import { Button, Icon, IconButton } from "@/components/Controls";
import { figures, TOUCH, useTheme } from "@/src/theme";
import { formatISO, parseISO, toISO, todayISO } from "@/src/dates";

const CELL = 44;

/**
 * A date as "YYYY-MM-DD" picked from a calendar instead of typed. One tap on a day confirms it.
 * Tap the month title to jump to another year. Weeks start on Monday. Days outside `min`..`max`
 * can't be picked (history can't be in the future or before the vehicle was built).
 */
export function DateField({
  value,
  onChange,
  label,
  placeholder = "Select a date",
  allowClear,
  min,
  max,
  style,
}: {
  value: string;
  onChange: (iso: string) => void;
  /** Spoken name of the field, e.g. "Visit date". */
  label: string;
  placeholder?: string;
  allowClear?: boolean;
  /** Earliest and latest day that can be picked, as "YYYY-MM-DD". */
  min?: string;
  max?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [yearMode, setYearMode] = useState(false);
  const selected = parseISO(value);
  const now = parseISO(todayISO())!;
  const [view, setView] = useState({ y: selected?.y ?? now.y, m: selected?.m ?? now.m });
  const allowed = (iso: string) => !(min && iso < min) && !(max && iso > max);
  const minP = min ? parseISO(min) : null;
  const maxP = max ? parseISO(max) : null;
  const monthKey = (y: number, m: number) => y * 12 + m;
  const canPrev = !minP || monthKey(view.y, view.m) > monthKey(minP.y, minP.m);
  const canNext = !maxP || monthKey(view.y, view.m) < monthKey(maxP.y, maxP.m);

  const openPicker = () => {
    // Open on the chosen day, else today, kept inside the allowed range.
    let p = parseISO(value) ?? now;
    if (minP && monthKey(p.y, p.m) < monthKey(minP.y, minP.m)) p = minP;
    if (maxP && monthKey(p.y, p.m) > monthKey(maxP.y, maxP.m)) p = maxP;
    setView({ y: p.y, m: p.m });
    setYearMode(false);
    setOpen(true);
  };

  const pick = (iso: string) => {
    onChange(iso);
    setOpen(false);
  };

  const shiftMonth = (delta: number) => {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  // Monday-first grid: leading blanks, then every day of the month.
  const cells = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const lead = (first.getDay() + 6) % 7;
    const days = new Date(view.y, view.m + 1, 0).getDate();
    return [...Array<null>(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  }, [view]);

  const weekdays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(undefined, { weekday: "narrow" })),
    []
  );
  const years = useMemo(() => {
    const top = maxP?.y ?? now.y + 1;
    const bottom = minP?.y ?? top - 69;
    return Array.from({ length: Math.max(1, Math.min(150, top - bottom + 1)) }, (_, i) => top - i);
  }, [now.y, maxP?.y, minP?.y]);
  const title = new Date(view.y, view.m, 1).toLocaleDateString(undefined, { month: "long", year: "numeric" });

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${selected ? formatISO(value, "long") : "not set"}`}
        accessibilityHint="Opens a calendar"
        onPress={openPicker}
        style={({ pressed }) => [
          styles.field,
          { backgroundColor: colors.card, borderColor: colors.border },
          pressed && { backgroundColor: colors.raised },
          style,
        ]}
      >
        <Text style={[styles.fieldText, { color: selected ? colors.text : colors.textMuted }]}>
          {selected ? formatISO(value) : placeholder}
        </Text>
        <Icon name="calendar" color={colors.textMuted} size={18} />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <View style={styles.backdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setOpen(false)} accessibilityLabel="Close calendar" accessibilityRole="button" />
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} accessibilityViewIsModal>
            <View style={styles.header}>
              {yearMode ? (
                <View style={styles.navSpacer} />
              ) : (
                <IconButton name="chevronLeft" label="Previous month" disabled={!canPrev} onPress={() => canPrev && shiftMonth(-1)} />
              )}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={yearMode ? "Back to days" : `${title}, choose year`}
                onPress={() => setYearMode((v) => !v)}
                style={styles.titleBtn}
              >
                <Text style={[styles.title, { color: colors.text }]}>{yearMode ? String(view.y) : title}</Text>
                <Icon name="chevronDown" color={colors.textMuted} size={16} />
              </Pressable>
              {yearMode ? (
                <View style={styles.navSpacer} />
              ) : (
                <IconButton name="chevron" label="Next month" disabled={!canNext} onPress={() => canNext && shiftMonth(1)} />
              )}
            </View>

            {yearMode ? (
              <ScrollView style={styles.yearScroll} contentContainerStyle={styles.yearGrid}>
                {years.map((y) => (
                  <Pressable
                    key={y}
                    accessibilityRole="button"
                    accessibilityState={{ selected: y === view.y }}
                    onPress={() => {
                      // Keep the month inside the range in the year picked.
                      let m = view.m;
                      if (minP && monthKey(y, m) < monthKey(minP.y, minP.m)) m = minP.m;
                      if (maxP && monthKey(y, m) > monthKey(maxP.y, maxP.m)) m = maxP.m;
                      setView({ y, m });
                      setYearMode(false);
                    }}
                    style={[styles.yearCell, y === view.y && { backgroundColor: colors.primary }]}
                  >
                    <Text style={[figures, { fontSize: 15, color: y === view.y ? colors.onPrimary : colors.text }]}>{y}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            ) : (
              <>
                <View style={styles.week}>
                  {weekdays.map((w, i) => (
                    <Text key={i} style={[styles.weekday, { color: colors.textMuted }]}>{w}</Text>
                  ))}
                </View>
                <View style={styles.grid}>
                  {cells.map((d, i) => {
                    if (d === null) return <View key={`b${i}`} style={styles.cell} />;
                    const iso = toISO(view.y, view.m, d);
                    const isSelected = iso === value;
                    const isToday = iso === todayISO();
                    const enabled = allowed(iso);
                    return (
                      <Pressable
                        key={iso}
                        accessibilityRole="button"
                        accessibilityLabel={formatISO(iso, "long")}
                        accessibilityState={{ selected: isSelected, disabled: !enabled }}
                        disabled={!enabled}
                        onPress={() => pick(iso)}
                        style={[
                          styles.cell,
                          styles.day,
                          isSelected && { backgroundColor: colors.primary },
                          !isSelected && isToday && { borderWidth: 1, borderColor: colors.accent },
                          !enabled && { opacity: 0.3 },
                        ]}
                      >
                        <Text style={[figures, { fontSize: 15, fontWeight: isSelected ? "600" : "400", color: isSelected ? colors.onPrimary : colors.text }]}>
                          {d}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>
              </>
            )}

            <View style={styles.footer}>
              <Button label="Today" variant="outline" style={styles.footerBtn} disabled={!allowed(todayISO())} onPress={() => pick(todayISO())} />
              {allowClear && value !== "" ? (
                <Button label="Clear" variant="outline" style={styles.footerBtn} onPress={() => pick("")} />
              ) : (
                <Button label="Cancel" variant="outline" style={styles.footerBtn} onPress={() => setOpen(false)} />
              )}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
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
  fieldText: { fontSize: 15 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 16 },
  card: { width: "100%", maxWidth: 360, borderRadius: 16, borderWidth: 1, padding: 12 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  navSpacer: { width: TOUCH, height: TOUCH },
  titleBtn: { minHeight: TOUCH, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8 },
  title: { fontSize: 16, fontWeight: "600" },
  week: { flexDirection: "row" },
  weekday: { width: `${100 / 7}%`, textAlign: "center", fontSize: 12, paddingVertical: 4 },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, height: CELL },
  day: { alignItems: "center", justifyContent: "center", borderRadius: CELL / 2 },
  yearScroll: { maxHeight: CELL * 6 },
  yearGrid: { flexDirection: "row", flexWrap: "wrap" },
  yearCell: { width: "25%", height: CELL, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  footer: { flexDirection: "row", gap: 8, marginTop: 8 },
  footerBtn: { flex: 1 },
});
