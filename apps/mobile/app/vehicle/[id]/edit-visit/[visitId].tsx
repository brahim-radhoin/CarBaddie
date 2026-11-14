// Edit a garage visit: its header and its list of services.
import { ActivityIndicator, Alert, StyleSheet, View } from "react-native";
import { useLocalSearchParams, useRouter, useTheme } from "expo-router";
import { useServiceEvent, useUpdateServiceEvent, useDeleteServiceEvent } from "@/src/hooks/useDatabase";
import { Text } from "@/components/Themed";
import { VisitForm } from "@/components/VisitForm";

export default function EditVisitScreen() {
  const { id: vehicleId, visitId } = useLocalSearchParams<{ id: string; visitId: string }>();
  const { colors } = useTheme();
  const router = useRouter();
  const { data: visit, isLoading } = useServiceEvent(visitId);
  const updateMutation = useUpdateServiceEvent();
  const deleteMutation = useDeleteServiceEvent();

  if (isLoading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  if (!visit) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>This visit no longer exists.</Text>
      </View>
    );
  }

  const handleDelete = () => {
    Alert.alert("Delete Visit", `Delete this visit and its ${visit.items.length} service record(s)?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () =>
          deleteMutation.mutate(
            { visitId: visit.id, vehicleId: vehicleId! },
            {
              onSuccess: () => router.back(),
              onError: (err) => Alert.alert("Error", err.message || "Failed to delete the visit."),
            }
          ),
      },
    ]);
  };

  return (
    <VisitForm
      key={visit.id}
      vehicleId={vehicleId!}
      initial={visit}
      saveLabel="Save Changes"
      onSubmit={async (data) => {
        await updateMutation.mutateAsync({ visitId: visit.id, data });
        router.back();
      }}
      onDelete={handleDelete}
    />
  );
}

const styles = StyleSheet.create({
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
});
