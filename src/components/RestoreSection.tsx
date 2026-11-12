import { useState } from "react";
import { useAnalyzeBackup, useRestoreBackup } from "../api";
import { RestorePlan, FullBackupData } from "../types";
import { toast } from "sonner";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";

// UI Components & Icons
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Upload, Trash2 } from "lucide-react";
import { LoadingButton } from "@/components/interior/loading-button";
import { HoldToConfirm } from "@/components/interior/hold-to-confirm";

export function RestoreSection() {
  const analyzeMutation = useAnalyzeBackup();
  const restoreMutation = useRestoreBackup();

  const [backupFileName, setBackupFileName] = useState<string | null>(null);
  const [parsedBackupData, setParsedBackupData] = useState<FullBackupData | null>(null);
  const [restorePlan, setRestorePlan] = useState<RestorePlan>({ vehicles_to_add: [], conflict_resolutions: [] });

  const processFileContent = (content: string, filename: string) => {
    try {
      const parsedData = JSON.parse(content) as FullBackupData;
      if (!parsedData.metadata || !parsedData.vehicles || !parsedData.service_types) {
        throw new Error("Invalid backup file: missing metadata, vehicles, or service_types.");
      }

      setParsedBackupData(parsedData);
      setBackupFileName(filename);
      analyzeMutation.reset();
      setRestorePlan({ vehicles_to_add: [], conflict_resolutions: [] });

      toast.success("Backup loaded successfully");
    } catch (error) {
      console.error("Failed to load backup:", error);
      toast.error(`Invalid backup: ${error instanceof Error ? error.message : String(error)}`);
      handleClearFile();
    }
  };

  const handleFileSelect = async () => {
    const isTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

    if (isTauri) {
      try {
        const filePath = await open({
          multiple: false,
          filters: [{ name: "JSON", extensions: ["json"] }],
        });

        if (!filePath) return;
        const content = await readTextFile(filePath);
        processFileContent(content, filePath.split(/[/\\]/).pop() || "backup.json");
        return;
      } catch (tauriError) {
        console.warn("Tauri open failed, falling back to browser input:", tauriError);
      }
    }

    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json,.json";
    input.onchange = (e) => {
      const file = (e.target as HTMLInputElement).files?.[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        processFileContent(content, file.name);
      };
      reader.onerror = () => {
        toast.error("Failed to read the file");
      };
      reader.readAsText(file);
    };
    input.click();
  };

  const handleClearFile = () => {
    setBackupFileName(null);
    setParsedBackupData(null);
    analyzeMutation.reset();
    setRestorePlan({ vehicles_to_add: [], conflict_resolutions: [] });
  };

  const handleAnalyze = () => {
    if (!parsedBackupData) return;
    const formData = new FormData();
    const blob = new Blob([JSON.stringify(parsedBackupData)], { type: "application/json" });
    formData.append("file", blob, backupFileName || "backup.json");

    analyzeMutation.mutate(formData, {
      onSuccess: (analysis) => {
        const initialPlan: RestorePlan = {
          vehicles_to_add: analysis.new_vehicles.map((v) => v.id_in_backup),
          conflict_resolutions: analysis.conflicting_vehicles.map((c) => ({
            vin: c.vin,
            action: "skip",
          })),
        };
        setRestorePlan(initialPlan);
      },
    });
  };

  const handleRestore = () => {
    if (!parsedBackupData) return;
    restoreMutation.mutate(
      { backup_data: parsedBackupData, plan: restorePlan },
      {
        onSuccess: () => {
          toast.success("Database restored successfully!");
          handleClearFile();
        },
      }
    );
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div>
        <h3 className="text-sm font-medium text-foreground">
          Import & Restore Backup
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Load a JSON backup file to restore vehicles, maintenance logs, and categories with dry-run conflict analysis.
        </p>
      </div>

      {!backupFileName ? (
        <div
          onClick={handleFileSelect}
          role="button"
          tabIndex={0}
          className="rounded border border-dashed border-border p-6 text-center hover:bg-accent/20 cursor-pointer transition-colors"
        >
          <Upload className="h-5 w-5 mx-auto text-muted-foreground opacity-60 mb-2" />
          <p className="text-xs font-medium text-foreground">Select Backup JSON File</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Click to choose a backup file from your disk</p>
        </div>
      ) : (
        <div className="space-y-4 pt-2">
          <div className="flex items-center justify-between p-3 rounded border border-border bg-background text-xs">
            <span className="font-mono text-foreground">{backupFileName}</span>
            <Button variant="ghost" size="sm" onClick={handleClearFile} className="h-6 text-xs text-muted-foreground hover:text-destructive">
              <Trash2 className="h-3.5 w-3.5 mr-1" /> Remove
            </Button>
          </div>

          {!analyzeMutation.data && (
            <div className="flex justify-end">
              <LoadingButton
                size="sm"
                onClick={handleAnalyze}
                loading={analyzeMutation.isPending}
                disabled={analyzeMutation.isPending}
                pendingLabel="Analyzing..."
                className="h-8 text-xs px-3"
              >
                Analyze Conflicts
              </LoadingButton>
            </div>
          )}

          {analyzeMutation.data && (
            <div className="space-y-4 border-t border-border pt-4 text-xs">
              <div>
                <p className="font-medium text-foreground">
                  New Vehicles to Add ({analyzeMutation.data.new_vehicles.length})
                </p>
                <div className="space-y-1.5 mt-2">
                  {analyzeMutation.data.new_vehicles.map((v) => (
                    <label key={v.id_in_backup} className="flex items-center gap-2 cursor-pointer">
                      <Checkbox
                        checked={restorePlan.vehicles_to_add.includes(v.id_in_backup)}
                        onCheckedChange={(checked) => {
                          setRestorePlan((prev) => ({
                            ...prev,
                            vehicles_to_add: checked
                              ? [...prev.vehicles_to_add, v.id_in_backup]
                              : prev.vehicles_to_add.filter((id) => id !== v.id_in_backup),
                          }));
                        }}
                      />
                      <span>{v.make} {v.model} {v.vin ? `(${v.vin})` : ""}</span>
                    </label>
                  ))}
                </div>
              </div>

              {analyzeMutation.data.conflicting_vehicles.length > 0 && (
                <div>
                  <p className="font-medium text-destructive">
                    Conflicting Vehicles ({analyzeMutation.data.conflicting_vehicles.length})
                  </p>
                  <div className="space-y-3 mt-2">
                    {analyzeMutation.data.conflicting_vehicles.map((c) => (
                      <div key={c.vin} className="p-3 rounded border border-border bg-background">
                        <p className="font-medium text-foreground mb-2">
                          {c.backup_vehicle.make} {c.backup_vehicle.model} ({c.vin})
                        </p>
                        <RadioGroup
                          defaultValue="skip"
                          onValueChange={(val) => {
                            setRestorePlan((prev) => ({
                              ...prev,
                              conflict_resolutions: [
                                ...prev.conflict_resolutions.filter((cr) => cr.vin !== c.vin),
                                { vin: c.vin, action: val as "skip" | "replace" },
                              ],
                            }));
                          }}
                          className="flex gap-4 text-xs"
                        >
                          <div className="flex items-center gap-1.5">
                            <RadioGroupItem value="skip" id={`skip-${c.vin}`} />
                            <Label htmlFor={`skip-${c.vin}`}>Skip</Label>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <RadioGroupItem value="replace" id={`rep-${c.vin}`} />
                            <Label htmlFor={`rep-${c.vin}`}>Overwrite existing</Label>
                          </div>
                        </RadioGroup>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="pt-2 flex justify-end">
                <HoldToConfirm
                  onConfirm={handleRestore}
                  confirmLabel="Restoring Database..."
                  duration={1500}
                  className="h-8 text-xs"
                >
                  Hold to Execute Restore
                </HoldToConfirm>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
