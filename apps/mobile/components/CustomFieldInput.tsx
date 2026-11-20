// One custom field of a service type, typed the way its type needs: a calendar for dates, a
// number keyboard for numbers, yes/no buttons, text otherwise. Shared by the visit form and the
// standalone log form, so a date field can't take text anywhere on the phone.
import { StyleSheet, TouchableOpacity, View, type StyleProp, type TextStyle } from "react-native";
import { fieldValueProblem, parseISO, type CustomFieldRead } from "@carbaddie/core";
import { Text, TextInput } from "@/components/Themed";
import { DateField } from "@/components/DateField";
import { useTheme } from "@/src/theme";

export function CustomFieldInput({
  field,
  value,
  onChange,
  inputStyle,
  pillBackground,
}: {
  field: Pick<CustomFieldRead, "id" | "name" | "field_type" | "unit">;
  value: string;
  onChange: (value: string) => void;
  inputStyle: StyleProp<TextStyle>;
  /** Background of an unselected yes/no button (the surface it sits on). */
  pillBackground: string;
}) {
  const { colors } = useTheme();
  const problem = fieldValueProblem(field.field_type, value);
  const label = `${field.name}${field.unit ? ` (${field.unit})` : ""}`;

  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: colors.text }]}>{label}</Text>
      {field.field_type === "boolean" ? (
        <View style={styles.booleanRow}>
          {(["true", "false"] as const).map((v) => {
            const selected = value === v;
            return (
              <TouchableOpacity
                key={v}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[styles.pill, { backgroundColor: selected ? colors.primary : pillBackground, borderColor: selected ? colors.primary : colors.border }]}
                onPress={() => onChange(v)}
                activeOpacity={0.7}
              >
                <Text style={{ color: selected ? colors.onPrimary : colors.text, fontWeight: selected ? "600" : "500", fontSize: 13 }}>
                  {v === "true" ? "Yes" : "No"}
                </Text>
              </TouchableOpacity>
            );
          })}
          {value !== "" && (
            <TouchableOpacity accessibilityRole="button" style={[styles.clear, { borderColor: colors.border }]} onPress={() => onChange("")}>
              <Text style={{ color: colors.textMuted, fontSize: 12 }}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>
      ) : field.field_type === "date" ? (
        <>
          {/* Dates here may be in the future (a warranty end), so no upper bound. */}
          <DateField label={field.name} value={parseISO(value) ? value : ""} onChange={onChange} placeholder="Optional" allowClear />
          {value !== "" && !parseISO(value) && (
            <Text style={[styles.note, { color: colors.textSecondary }]}>Saved as “{value}”. Pick a date to replace it</Text>
          )}
        </>
      ) : (
        <>
          <TextInput
            style={inputStyle}
            value={value}
            onChangeText={onChange}
            keyboardType={field.field_type === "number" ? "decimal-pad" : "default"}
            placeholder={field.field_type === "number" ? "A number" : "Optional"}
            placeholderTextColor={colors.textMuted}
            accessibilityLabel={label}
          />
          {problem && <Text style={[styles.note, { color: colors.danger }]}>{problem[0].toUpperCase() + problem.slice(1)}</Text>}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { marginBottom: 4 },
  label: { fontSize: 13, fontWeight: "600", marginBottom: 6, marginTop: 16 },
  booleanRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  pill: { minHeight: 44, justifyContent: "center", borderWidth: 1, borderRadius: 8, paddingHorizontal: 18 },
  clear: { minHeight: 44, justifyContent: "center", borderWidth: 1, borderRadius: 8, paddingHorizontal: 10 },
  note: { fontSize: 12, marginTop: 6 },
});
