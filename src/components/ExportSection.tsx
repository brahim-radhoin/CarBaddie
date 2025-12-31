import { useState } from "react";
import { useExportBackup } from "../api";
import { VehicleRead, BackupConfiguration } from "../types";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";

// UI Components & Icons
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Download, Loader2, CalendarIcon } from "lucide-react";

interface ExportSectionProps {
  allVehicles: VehicleRead[];
}

export function ExportSection({ allVehicles }: ExportSectionProps) {
  const exportMutation = useExportBackup();

  // State is now encapsulated within this component
  const [selectedVehicleIds, setSelectedVehicleIds] = useState<number[]>([]);
  const [includeLogs, setIncludeLogs] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  const handleVehicleSelect = (vehicleId: number) => {
    setSelectedVehicleIds((prev) => (prev.includes(vehicleId) ? prev.filter((id) => id !== vehicleId) : [...prev, vehicleId]));
  };

  const allSelected = allVehicles.length > 0 && selectedVehicleIds.length === allVehicles.length;
  const toggleSelectAll = () => {
    setSelectedVehicleIds(allSelected ? [] : allVehicles.map((v) => v.id));
  };

  const handleExportBackup = () => {
    const config: BackupConfiguration = {
      vehicle_ids: selectedVehicleIds.length > 0 ? selectedVehicleIds : undefined,
      include_maintenance_logs: includeLogs,
      start_date: dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : undefined,
      end_date: dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined,
    };

    exportMutation.mutate(config, {
      onSuccess: async (blob) => {
        try {
          // Convert blob to JSON string
          const text = await blob.text();
          console.log('Backup data converted to text, length:', text.length);

          // Show native save dialog
          const timestamp = new Date().toISOString().slice(0, 10);
          const filePath = await save({
            defaultPath: `carbaddie_backup_${timestamp}.json`,
            filters: [
              {
                name: "JSON",
                extensions: ["json"],
              },
            ],
          });

          console.log('Save dialog returned path:', filePath);

          // If user canceled, filePath will be null
          if (!filePath) {
            console.log('User canceled save dialog');
            return;
          }

          // Write file using Tauri FS plugin
          console.log('Attempting to write file to:', filePath);
          await writeTextFile(filePath, text);
          console.log('File written successfully');

          toast.success("Backup saved successfully!");
        } catch (error) {
          console.error("Failed to save backup:", error);
          console.error("Error type:", error instanceof Error ? 'Error' : typeof error);
          if (error instanceof Error) {
            console.error("Error message:", error.message);
            console.error("Error stack:", error.stack);
          }
          toast.error(`Failed to save backup: ${error instanceof Error ? error.message : String(error)}`);
        }
      },
      // onError is handled by the mutation hook
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Backup & Export</CardTitle>
        <CardDescription>Generate a full or partial backup of your application data in JSON format.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Vehicle Selection */}
        <div className="space-y-3">
          <Label className="text-base font-medium">1. Select Vehicles (optional)</Label>
          <div className="flex items-center space-x-2">
            <Checkbox id="select-all-vehicles" checked={allSelected} onCheckedChange={toggleSelectAll} />
            <Label htmlFor="select-all-vehicles" className="font-semibold">
              Select All
            </Label>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-2">
            {allVehicles.map((vehicle) => (
              <div key={vehicle.id} className="flex items-center space-x-2">
                <Checkbox
                  id={`vehicle-${vehicle.id}`}
                  checked={selectedVehicleIds.includes(vehicle.id)}
                  onCheckedChange={() => handleVehicleSelect(vehicle.id)}
                />
                <Label htmlFor={`vehicle-${vehicle.id}`} className="font-normal">
                  {vehicle.make} {vehicle.model}
                </Label>
              </div>
            ))}
          </div>
        </div>

        {/* Data Type and Date Filters */}
        <div className="space-y-3">
          <Label className="text-base font-medium">2. Configure Options</Label>
          <div className="flex items-center space-x-2">
            <Switch id="include-logs" checked={includeLogs} onCheckedChange={setIncludeLogs} />
            <Label htmlFor="include-logs">Include Maintenance Logs</Label>
          </div>
          <div className="space-y-1.5 pt-2">
            <Label>Filter Logs by Date Range (Optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button id="date" variant={"outline"} className="w-full justify-start text-left font-normal" disabled={!includeLogs}>
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      `${format(dateRange.from, "LLL dd, y")} - ${format(dateRange.to, "LLL dd, y")}`
                    ) : (
                      format(dateRange.from, "LLL dd, y")
                    )
                  ) : (
                    <span>Pick a date range</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar initialFocus mode="range" selected={dateRange} onSelect={setDateRange} numberOfMonths={2} />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </CardContent>
      <CardFooter className="border-t px-6 py-4">
        <Button onClick={handleExportBackup} disabled={exportMutation.isPending}>
          {exportMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
          Generate and Download Backup
        </Button>
      </CardFooter>
    </Card>
  );
}
