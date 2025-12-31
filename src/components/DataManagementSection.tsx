import { VehicleRead } from "../types";
import { Separator } from "@/components/ui/separator";
import { ExportSection } from "./ExportSection"; // Import the new components
import { RestoreSection } from "./RestoreSection";

interface DataManagementSectionProps {
  allVehicles: VehicleRead[];
}

export function DataManagementSection({ allVehicles }: DataManagementSectionProps) {
  return (
    <div className="space-y-8">
      {/* The Export feature is now fully encapsulated */}
      <ExportSection allVehicles={allVehicles} />

      <Separator />

      {/* The Restore feature is also fully encapsulated */}
      <RestoreSection />
    </div>
  );
}