import { VehicleRead } from "../types";
import { Separator } from "@/components/ui/separator";
import { ExportSection } from "./ExportSection";
import { RestoreSection } from "./RestoreSection";
import { GoogleDriveSyncSection } from "./GoogleDriveSyncSection";

interface DataManagementSectionProps {
  allVehicles: VehicleRead[];
}

export function DataManagementSection({ allVehicles }: DataManagementSectionProps) {
  return (
    <div className="space-y-8">
      {/* Cloud Synchronization */}
      <GoogleDriveSyncSection />

      <Separator />

      {/* The Export feature */}
      <ExportSection allVehicles={allVehicles} />

      <Separator />

      {/* The Restore feature */}
      <RestoreSection />
    </div>
  );
}