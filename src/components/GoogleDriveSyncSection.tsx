import { useState, useEffect } from "react";
import {
  getGoogleDriveStatus,
  setGoogleDriveToken,
  disconnectGoogleDrive,
  signInWithGoogle,
  setAutoSyncEnabled,
  uploadBackupToGoogleDrive,
  downloadBackupFromGoogleDrive,
  GoogleDriveStatus,
} from "../services/googleDrive";
import { useExportBackup, useAnalyzeBackup, useRestoreBackup } from "../api";
import { FullBackupData } from "../types";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Cloud, RotateCw, LogOut, ChevronDown, ChevronUp } from "lucide-react";

export function GoogleDriveSyncSection() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<GoogleDriveStatus>({ isConnected: false, autoSyncEnabled: true });
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customClientId, setCustomClientId] = useState("");
  const [manualTokenInput, setManualTokenInput] = useState("");

  const { mutateAsync: exportBackup } = useExportBackup();
  const { mutateAsync: analyzeBackup } = useAnalyzeBackup();
  const { mutateAsync: executeRestore } = useRestoreBackup();

  const refreshStatus = () => {
    setStatus(getGoogleDriveStatus());
  };

  useEffect(() => {
    refreshStatus();
  }, []);

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      const res = await signInWithGoogle(customClientId.trim() || undefined);
      if (res.success) {
        refreshStatus();
        toast.success(`Connected to Google Drive as ${res.email || "User"}!`);
      } else if (res.error) {
        toast.error(res.error);
      }
    } catch (e: any) {
      toast.error(e.message || "Failed to sign in with Google.");
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleDisconnect = () => {
    disconnectGoogleDrive();
    refreshStatus();
    toast.info("Google Drive disconnected.");
  };

  const handleToggleAutoSync = (enabled: boolean) => {
    setAutoSyncEnabled(enabled);
    setStatus((p) => ({ ...p, autoSyncEnabled: enabled }));
    toast.info(enabled ? "Automatic background sync enabled." : "Automatic sync paused.");
  };

  const handleSyncNow = async () => {
    try {
      setIsSyncing(true);
      // 1. Download latest from Google Drive
      const { backupData } = await downloadBackupFromGoogleDrive();

      // 2. Prepare FormData for analyze
      const formData = new FormData();
      const jsonBlob = new Blob([JSON.stringify(backupData)], { type: "application/json" });
      formData.append("file", jsonBlob, "carbaddie_backup.json");

      const analysis = await analyzeBackup(formData);
      const newCount = analysis.new_vehicles.length;
      const conflictCount = analysis.conflicting_vehicles.length;

      if (newCount === 0 && conflictCount === 0) {
        // Local is already in sync or newer -> push local
        const localBlob = await exportBackup({ include_maintenance_logs: true });
        const text = await localBlob.text();
        const localData: FullBackupData = JSON.parse(text);
        const res = await uploadBackupToGoogleDrive(localData);
        refreshStatus();
        toast.success(`In sync with Google Drive! (${new Date(res.modifiedTime).toLocaleTimeString()})`);
        return;
      }

      // Restore newer changes
      await executeRestore({
        backup_data: backupData,
        plan: {
          vehicles_to_add: analysis.new_vehicles.map((v) => v.id_in_backup),
          conflict_resolutions: analysis.conflicting_vehicles.map((c) => ({
            vin: c.vin,
            action: "replace",
          })),
        },
      });

      queryClient.invalidateQueries();
      refreshStatus();
      toast.success("Synchronized with Google Drive!");
    } catch (e: any) {
      // If no file exists in Drive yet, push local up
      try {
        const localBlob = await exportBackup({ include_maintenance_logs: true });
        const text = await localBlob.text();
        const localData: FullBackupData = JSON.parse(text);
        const res = await uploadBackupToGoogleDrive(localData);
        refreshStatus();
        toast.success(`First backup saved to Google Drive! (${new Date(res.modifiedTime).toLocaleTimeString()})`);
      } catch (err: any) {
        toast.error(err.message || "Sync failed.");
      }
    } finally {
      setIsSyncing(false);
    }
  };

  const handleManualTokenSave = async () => {
    if (!manualTokenInput.trim()) return;
    try {
      await setGoogleDriveToken(manualTokenInput.trim());
      refreshStatus();
      setManualTokenInput("");
      toast.success("Access token saved.");
    } catch (e: any) {
      toast.error(e.message || "Failed to save token.");
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-5 space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Cloud className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-medium text-foreground">Cloud Sync</h3>
            <span
              className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                status.isConnected
                  ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20"
                  : "bg-muted text-muted-foreground border border-border"
              }`}
            >
              {status.isConnected ? "✓ Active" : "Off"}
            </span>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Seamless background synchronization with Google Drive across your PC and mobile devices.
          </p>
        </div>

        {status.isConnected && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleDisconnect}
            className="h-7 text-xs text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-3 w-3 mr-1" />
            Sign Out
          </Button>
        )}
      </div>

      {status.isConnected ? (
        <div className="pt-3 border-t border-border/60 space-y-4">
          <div className="flex items-center justify-between text-xs">
            <div className="flex items-center gap-2.5">
              <div className="w-5 h-5 rounded-full bg-[#4285F4] text-white flex items-center justify-center font-bold text-[11px]">
                G
              </div>
              <span className="font-medium text-foreground">{status.email || "Connected Google Account"}</span>
            </div>
            {status.lastBackupTime && (
              <span className="text-muted-foreground font-mono text-[11px]">
                Last synced: {new Date(status.lastBackupTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between py-2 border-y border-border/40 text-xs">
            <div>
              <p className="font-medium text-foreground">Automatic Background Sync</p>
              <p className="text-[11px] text-muted-foreground">Keep database up to date whenever changes occur.</p>
            </div>
            <Switch
              checked={status.autoSyncEnabled}
              onCheckedChange={handleToggleAutoSync}
            />
          </div>

          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              onClick={handleSyncNow}
              disabled={isSyncing}
              className="h-8 text-xs font-medium gap-1.5"
            >
              <RotateCw className={`h-3.5 w-3.5 ${isSyncing ? "animate-spin" : ""}`} />
              {isSyncing ? "Syncing with Drive..." : "Sync Now"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="pt-3 border-t border-border/60 space-y-3">
          {/* Consumer-friendly Google Sign In */}
          <Button
            onClick={handleGoogleSignIn}
            disabled={isSigningIn}
            className="w-full sm:w-auto h-9 bg-white hover:bg-zinc-100 text-zinc-900 font-medium text-xs gap-2.5 shadow-sm border border-border"
          >
            <div className="w-4 h-4 rounded-full bg-[#4285F4] text-white flex items-center justify-center font-bold text-[10px]">
              G
            </div>
            {isSigningIn ? "Connecting to Google..." : "Sign in with Google"}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            Sign in to automatically sync your garage database to your personal Google Drive.
          </p>

          <button
            type="button"
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 pt-1 cursor-pointer"
          >
            {showAdvanced ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            Advanced Configuration
          </button>

          {showAdvanced && (
            <div className="p-3 rounded-lg border border-border/60 bg-background/50 space-y-3">
              <div className="space-y-1">
                <label className="text-[11px] font-medium text-foreground">Custom Google Client ID (Optional)</label>
                <Input
                  placeholder="Enter custom OAuth Client ID"
                  value={customClientId}
                  onChange={(e) => setCustomClientId(e.target.value)}
                  className="h-7 text-xs font-mono bg-background"
                />
              </div>

              <div className="space-y-1">
                <label className="text-[11px] font-medium text-foreground">Direct Access Token Fallback</label>
                <div className="flex gap-2">
                  <Input
                    placeholder="ya29..."
                    value={manualTokenInput}
                    onChange={(e) => setManualTokenInput(e.target.value)}
                    className="h-7 text-xs font-mono bg-background"
                  />
                  <Button size="sm" onClick={handleManualTokenSave} className="h-7 text-xs px-3">
                    Save
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
