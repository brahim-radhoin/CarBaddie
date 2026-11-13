import { useLocalSearchParams } from "expo-router";
import ServiceTypeForm from "@/components/ServiceTypeForm";

export default function EditServiceTypeScreen() {
  const params = useLocalSearchParams<{ id: string }>();
  const serviceTypeId = params.id || undefined;

  return <ServiceTypeForm serviceTypeId={serviceTypeId} />;
}
