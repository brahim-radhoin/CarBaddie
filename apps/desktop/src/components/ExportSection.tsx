import { useState } from "react";
import { useExportBackup } from "../api";
import { VehicleRead } from "../types";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";
import { toast } from "sonner";

// UI Components & Icons
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Download, Calendar as CalendarIcon } from "lucide-react";
import { LoadingButton } from "@/components/interior/loading-button";

interface ExportSectionProps {
  allVehicles: VehicleRead[];
}

export function ExportSection({ allVehicles }: ExportSectionProps) {
  const exportMutation = useExportBackup();

  const [selectedVehicleIds, setSelectedVehicleIds] = useState<string[]>([]);
  const [includeLogs, setIncludeLogs] = useState(true);
  const [dateRange, setDateRange] = useState<DateRange | undefined>();

  const handleVehicleSelect = (vehicleId: string) => {
    setSelectedVehicleIds((prev) =>
      prev.includes(vehicleId) ? prev.filter((id) => id !== vehicleId) : [...prev, vehicleId]
    );
  };

  const allSelected = allVehicles.length > 0 && selectedVehicleIds.length === allVehicles.length;
  const toggleSelectAll = () => {
    setSelectedVehicleIds(allSelected ? [] : allVehicles.map((v) => v.id));
  };

  const handleExportBackup = async () => {
    const config: any = {
      include_maintenance_logs: includeLogs,
    };
    if (selectedVehicleIds.length > 0) config.vehicle_ids = selectedVehicleIds;
    if (dateRange?.from) config.start_date = format(dateRange.from, "yyyy-MM-dd");
    if (dateRange?.to) config.end_date = format(dateRange.to, "yyyy-MM-dd");

    return new Promise<void>((resolve, reject) => {
      exportMutation.mutate(config, {
        onSuccess: async (blob) => {
          const timestamp = new Date().toISOString().slice(0, 10);
          const defaultFilename = `carbaddie_backup_${timestamp}.json`;
          const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

          if (isTauri) {
            try {
              const text = await blob.text();
              const filePath = await save({
                defaultPath: defaultFilename,
                filters: [{ name: "JSON", extensions: ["json"] }],
              });

              if (!filePath) {
                resolve();
                return;
              }

              await writeTextFile(filePath, text);
              toast.success("Backup file saved successfully");
              resolve();
            } catch (fsError) {
              console.error("Tauri file write failed, using fallback:", fsError);
              const url = window.URL.createObjectURL(blob);
              const link = document.createElement("a");
              link.href = url;
              link.setAttribute("download", defaultFilename);
              document.body.appendChild(link);
              link.click();
              link.remove();
              window.URL.revokeObjectURL(url);
              toast.success("Backup downloaded via browser fallback");
              resolve();
            }
          } else {
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement("a");
            link.href = url;
            link.setAttribute("download", defaultFilename);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
            toast.success("Backup downloaded successfully");
            resolve();
          }
        },
        onError: (err) => {
          toast.error("Failed to generate backup export");
          reject(err);
        },
      });
    });
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">
          Export Maintenance Backup
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Generate an offline JSON snapshot compatible with both CarBaddie desktop and mobile.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        {/* Vehicles Selection */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-foreground">Select Vehicles</span>
            <Button variant="ghost" size="sm" onClick={toggleSelectAll} className="h-6 text-[11px] px-2 text-muted-foreground">
              {allSelected ? "Deselect All" : "Select All"}
            </Button>
          </div>
          <div className="rounded border border-border bg-background p-2.5 max-h-36 overflow-y-auto space-y-1.5">
            {allVehicles.length === 0 ? (
              <p className="text-xs text-muted-foreground">No vehicles registered.</p>
            ) : (
              allVehicles.map((v) => (
                <label key={v.id} className="flex items-center gap-2 text-xs text-foreground cursor-pointer">
                  <Checkbox
                    checked={selectedVehicleIds.includes(v.id)}
                    onCheckedChange={() => handleVehicleSelect(v.id)}
                  />
                  <span className="truncate">
                    {v.make} {v.model} {v.year ? `(${v.year})` : ""}
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        {/* Export Options */}
        <div className="space-y-4">
          <div className="flex items-center justify-between pt-1">
            <div className="space-y-0.5">
              <Label className="text-xs font-medium text-foreground">Include Service Records</Label>
              <p className="text-[11px] text-muted-foreground">Include maintenance history and cost telemetry</p>
            </div>
            <Switch checked={includeLogs} onCheckedChange={setIncludeLogs} />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs font-medium text-foreground">Date Window (Optional)</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="w-full justify-start text-xs font-mono h-8 bg-background">
                  <CalendarIcon className="mr-2 h-3.5 w-3.5 opacity-60" />
                  {dateRange?.from ? (
                    dateRange.to ? (
                      <>
                        {format(dateRange.from, "yyyy-MM-dd")} → {format(dateRange.to, "yyyy-MM-dd")}
                      </>
                    ) : (
                      format(dateRange.from, "yyyy-MM-dd")
                    )
                  ) : (
                    <span>All Recorded History</span>
                  )}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar
                  initialFocus
                  mode="range"
                  defaultMonth={dateRange?.from}
                  selected={dateRange}
                  onSelect={setDateRange}
                  numberOfMonths={1}
                />
              </PopoverContent>
            </Popover>
          </div>
        </div>
      </div>

      <div className="pt-2 flex justify-end">
        <LoadingButton
          variant="default"
          size="sm"
          onClick={handleExportBackup}
          loading={exportMutation.isPending}
          disabled={exportMutation.isPending}
          pendingLabel="Exporting..."
          className="h-8 text-xs px-3"
        >
          <Download className="mr-1.5 h-3.5 w-3.5" />
          Export JSON Backup
        </LoadingButton>
      </div>
    </div>
  );
}
