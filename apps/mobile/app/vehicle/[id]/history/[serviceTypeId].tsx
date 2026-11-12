import { StyleSheet, FlatList, TouchableOpacity, View, Alert } from "react-native";
import { useLocalSearchParams, useRouter, useTheme } from "expo-router";
import { useLogsForServiceType, useServiceType, useDeleteMaintenanceLog } from "@/src/hooks/useDatabase";
import { Text } from "@/components/Themed";
import type { MaintenanceLogRead } from "@/src/types";

export default function ServiceHistoryScreen() {
  const { id: vehicleId, serviceTypeId } = useLocalSearchParams<{ id: string; serviceTypeId: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const { data: logs } = useLogsForServiceType(vehicleId, serviceTypeId);
  const { data: serviceType } = useServiceType(serviceTypeId);
  const deleteMutation = useDeleteMaintenanceLog();

  const handleDelete = (logId: number) => {
    Alert.alert("Delete Log", "Are you sure?", [
      { text: "Cancel", style: "cancel" },
      { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate({ logId, vehicleId: Number(vehicleId) }) },
    ]);
  };

  const renderLog = ({ item }: { item: MaintenanceLogRead }) => (
    <TouchableOpacity style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]} onPress={() => router.push(`/vehicle/${vehicleId}/edit-log/${item.id}`)} onLongPress={() => handleDelete(item.id)} activeOpacity={0.7}>
      <View style={styles.row}>
        <Text style={[styles.date, { color: colors.text }]}>{item.date}</Text>
        <Text style={[styles.cost, { color: colors.primary }]}>${item.cost.toFixed(2)}</Text>
      </View>
      <Text style={[styles.mileage, { color: (colors.text as string) + "88" }]}>{item.mileage.toLocaleString()} km</Text>
      {item.notes && <Text style={[styles.notes, { color: (colors.text as string) + "66" }]} numberOfLines={2}>{item.notes}</Text>}
      {item.custom_field_values.length > 0 && (
        <View style={[styles.fieldsRow, { borderTopColor: colors.border }]}>
          {item.custom_field_values.map((cfv) => (
            <Text key={cfv.id} style={[styles.fieldText, { color: (colors.text as string) + "77" }]}>
              {cfv.custom_field?.name ?? "Field"}: {cfv.value}{cfv.custom_field?.unit ? ` ${cfv.custom_field.unit}` : ""}
            </Text>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {serviceType && <Text style={[styles.header, { color: colors.primary }]}>{serviceType.name} History</Text>}
      <FlatList data={logs ?? []} keyExtractor={(item) => String(item.id)} renderItem={renderLog} contentContainerStyle={styles.list}
        ListEmptyComponent={<Text style={[styles.empty, { color: (colors.text as string) + "88" }]}>No logs for this service type</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 }, list: { padding: 16 },
  header: { fontSize: 20, fontWeight: "800", paddingHorizontal: 16, paddingTop: 16 },
  card: { borderRadius: 12, borderWidth: 1, padding: 14, marginBottom: 8 },
  row: { flexDirection: "row", justifyContent: "space-between" },
  date: { fontSize: 15, fontWeight: "700" }, cost: { fontSize: 15, fontWeight: "700" },
  mileage: { fontSize: 13, marginTop: 4 }, notes: { fontSize: 12, marginTop: 4, fontStyle: "italic" },
  fieldsRow: { borderTopWidth: 1, marginTop: 8, paddingTop: 8 },
  fieldText: { fontSize: 12, marginBottom: 2 },
  empty: { textAlign: "center", paddingTop: 40, fontSize: 14 },
});