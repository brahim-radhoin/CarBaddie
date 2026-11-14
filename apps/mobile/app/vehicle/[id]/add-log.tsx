// Add a garage visit: one or more services at the same date and odometer reading.
import { useLocalSearchParams, useRouter } from "expo-router";
import { useAddServiceEvent } from "@/src/hooks/useDatabase";
import { VisitForm } from "@/components/VisitForm";

export default function AddLogScreen() {
  const params = useLocalSearchParams<{ id: string; serviceTypeId?: string }>();
  const vehicleId = params.id;
  const router = useRouter();
  const addMutation = useAddServiceEvent();

  return (
    <VisitForm
      vehicleId={vehicleId!}
      initialServiceTypeId={params.serviceTypeId || null}
      saveLabel="Save Visit"
      onSubmit={async (data) => {
        await addMutation.mutateAsync({ vehicleId: vehicleId!, data });
        router.back();
      }}
    />
  );
}
