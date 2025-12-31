import { useState } from "react";
import { useAnalyzeBackup, useRestoreBackup } from "../api";
import { RestorePlan, FullBackupData, BackupAnalysisResponse } from "../types";
import { toast } from "sonner";
import { AxiosError } from "axios";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";

// UI Components & Icons
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Upload, AlertTriangle, Loader2, SkipForward, Replace, FileUp, FileCheck2, Trash2 } from "lucide-react";

export function RestoreSection() {
  const analyzeMutation = useAnalyzeBackup();
  const restoreMutation = useRestoreBackup();

  // State encapsulated within this component
  const [backupFileName, setBackupFileName] = useState<string | null>(null);
  const [parsedBackupData, setParsedBackupData] = useState<FullBackupData | null>(null);
  const [restorePlan, setRestorePlan] = useState<RestorePlan>({ vehicles_to_add: [], conflict_resolutions: [] });

  // Handle file selection with Tauri dialog
  const handleFileSelect = async () => {
    try {
      const filePath = await open({
        multiple: false,
        filters: [
          {
            name: "JSON",
            extensions: ["json"],
          },
        ],
      });

      if (!filePath) {
        console.log("User canceled file dialog");
        return;
      }

      console.log("Selected file:", filePath);

      // Read file content
      const content = await readTextFile(filePath);
      console.log("File content read, length:", content.length);

      // Parse JSON
      const parsedData = JSON.parse(content) as FullBackupData;

      // Basic validation
      if (!parsedData.metadata || !parsedData.vehicles || !parsedData.service_types) {
        throw new Error("Invalid backup file structure.");
      }

      setParsedBackupData(parsedData);
      setBackupFileName(filePath.split(/[/\\]/).pop() || "backup.json"); // Extract filename
      analyzeMutation.reset();
      setRestorePlan({ vehicles_to_add: [], conflict_resolutions: [] });

      toast.success("Backup file loaded successfully");
    } catch (error) {
      console.error("Failed to load backup:", error);
      if (error instanceof SyntaxError) {
        toast.error("Could not parse the backup file. It may be corrupt or invalid.");
      } else {
        toast.error(`Failed to load backup file: ${error instanceof Error ? error.message : String(error)}`);
      }
      handleClearFile();
    }
  };

  const handleClearFile = () => {
    setBackupFileName(null);
    setParsedBackupData(null);
    analyzeMutation.reset();
  };

  const handleAnalyzeBackup = () => {
    if (!parsedBackupData) {
      toast.error("No backup file loaded");
      return;
    }

    // Create FormData with the parsed backup as a JSON string
    const formData = new FormData();
    const jsonBlob = new Blob([JSON.stringify(parsedBackupData)], { type: "application/json" });
    formData.append("backup_file", jsonBlob, backupFileName || "backup.json");

    analyzeMutation.mutate(formData, {
      onSuccess: (analysis: BackupAnalysisResponse) => {
        setRestorePlan({
          vehicles_to_add: analysis.new_vehicles.map((v) => v.id_in_backup),
          conflict_resolutions: analysis.conflicting_vehicles.map((c) => ({ vin: c.vin, action: "skip" })),
        });
      },
    });
  };

  const handleExecuteRestore = () => {
    if (!analyzeMutation.data || !parsedBackupData) {
      toast.error("Cannot execute restore without a valid analysis and parsed file.");
      return;
    }
    const payload = { plan: restorePlan, backup_data: parsedBackupData };
    restoreMutation.mutate(payload, {
      onSuccess: () => {
        // The hook in api.ts now handles the success toast.
        // The page reload is a significant side effect that should stay here.
        setTimeout(() => window.location.reload(), 1500);
      },
      // Error is handled by the hook in api.ts
    });
  };

  const handlePlanChange = (vin: string, action: "skip" | "replace") => {
    setRestorePlan((prev) => ({
      ...prev,
      conflict_resolutions: prev.conflict_resolutions.map((res) => (res.vin === vin ? { ...res, action } : res)),
    }));
  };

  const handleAddVehicleToggle = (id_in_backup: number) => {
    setRestorePlan((prev) => ({
      ...prev,
      vehicles_to_add: prev.vehicles_to_add.includes(id_in_backup)
        ? prev.vehicles_to_add.filter((id) => id !== id_in_backup)
        : [...prev.vehicles_to_add, id_in_backup],
    }));
  };

  const analysisResult = analyzeMutation.data;

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-xl font-semibold">Restore from Backup</h3>
        <p className="text-sm text-orange-600 dark:text-orange-400">
          <AlertTriangle className="inline h-4 w-4 mr-1.5" />
          Warning: This action can replace existing data. Proceed with caution.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Step 1: Upload Backup File</CardTitle>
          <CardDescription>Select the `.json` backup file you wish to restore.</CardDescription>
        </CardHeader>
        <CardContent>
          {!backupFileName ? (
            <div className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg bg-muted/50">
              <FileUp className="w-8 h-8 mb-3 text-muted-foreground" />
              <p className="mb-2 text-sm text-muted-foreground">No file selected</p>
              <Button onClick={handleFileSelect} variant="outline" size="sm">
                <Upload className="mr-2 h-4 w-4" />
                Browse for Backup File
              </Button>
            </div>
          ) : (
            <div className="flex items-center justify-between p-3 border rounded-lg bg-muted/50">
              <div className="flex items-center gap-3">
                <FileCheck2 className="h-6 w-6 text-green-500" />
                <div>
                  <span className="text-sm font-medium">{backupFileName}</span>
                  <span className="text-xs text-muted-foreground block">Loaded successfully</span>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={handleClearFile}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          )}
        </CardContent>
        <CardFooter>
          <Button onClick={handleAnalyzeBackup} disabled={!backupFileName || analyzeMutation.isPending}>
            {analyzeMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Analyze Backup File
          </Button>
        </CardFooter>

        {analyzeMutation.isError && (
          <CardContent>
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Analysis Error</AlertTitle>
              <AlertDescription>
                {(analyzeMutation.error as AxiosError<{ detail: string }>)?.response?.data?.detail || "An unknown error occurred."}
              </AlertDescription>
            </Alert>
          </CardContent>
        )}

        {analysisResult && (
          <CardContent className="border-t pt-6 space-y-6">
            <h3 className="text-lg font-semibold">Step 2: Configure Restore Plan</h3>
            {analysisResult.new_vehicles.length > 0 && (
              <div className="space-y-2">
                <Label className="font-medium">New Vehicles to Add</Label>
                {analysisResult.new_vehicles.map((v) => (
                  <div key={v.id_in_backup} className="flex items-center space-x-2">
                    <Checkbox
                      id={`add-${v.id_in_backup}`}
                      checked={restorePlan.vehicles_to_add.includes(v.id_in_backup)}
                      onCheckedChange={() => handleAddVehicleToggle(v.id_in_backup)}
                    />
                    <Label htmlFor={`add-${v.id_in_backup}`} className="font-normal">
                      {v.make} {v.model} ({v.vin || "No VIN"})
                    </Label>
                  </div>
                ))}
              </div>
            )}
            {analysisResult.conflicting_vehicles.length > 0 && (
              <div className="space-y-4">
                <Label className="font-medium">Conflicting Vehicles</Label>
                {analysisResult.conflicting_vehicles.map((c) => (
                  <div key={c.vin} className="p-4 border rounded-md">
                    <p className="font-semibold">
                      {c.backup_vehicle.make} {c.backup_vehicle.model} ({c.vin})
                    </p>
                    <RadioGroup
                      value={restorePlan.conflict_resolutions.find((r) => r.vin === c.vin)?.action || "skip"}
                      className="mt-2"
                      onValueChange={(value: "skip" | "replace") => handlePlanChange(c.vin, value)}
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="skip" id={`skip-${c.vin}`} />
                        <Label htmlFor={`skip-${c.vin}`} className="flex items-center gap-2">
                          <SkipForward className="h-4 w-4" /> Skip
                        </Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="replace" id={`replace-${c.vin}`} />
                        <Label htmlFor={`replace-${c.vin}`} className="flex items-center gap-2 text-destructive">
                          <Replace className="h-4 w-4" /> Replace
                        </Label>
                      </div>
                    </RadioGroup>
                  </div>
                ))}
              </div>
            )}
            <CardFooter className="px-0 pt-6">
              <Button onClick={handleExecuteRestore} disabled={restoreMutation.isPending} variant="destructive">
                {restoreMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}
                Confirm and Execute Restore
              </Button>
            </CardFooter>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
