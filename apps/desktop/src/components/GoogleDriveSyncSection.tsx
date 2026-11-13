import { useState, useEffect, useCallback } from "react";
import {
  getGoogleDriveStatus,
  disconnectGoogleDrive,
  signInWithGoogle,
  setAutoSyncEnabled,
  uploadBackupToGoogleDrive,
  downloadBackupFromGoogleDrive,
  GoogleDriveStatus,
} from "../services/googleDrive";
import { getLastSyncTime, resetSyncProgress, syncNow, SYNCED_EVENT } from "../services/sync";
import { useAnalyzeBackup, useRestoreBackup } from "../api";
import { getRepository } from "../db";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Cloud, RotateCw, LogOut, ChevronDown, ChevronUp, Upload, Download } from "lucide-react";

const errorText = (e: unknown, fallback: string) => (e instanceof Error && e.message) || fallback;

export function GoogleDriveSyncSection() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<GoogleDriveStatus>({ isConnected: false, autoSyncEnabled: true });
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [busy, setBusy] = useState<"sync" | "upload" | "download" | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [customClientId, setCustomClientId] = useState("");

  const { mutateAsync: analyzeBackup } = useAnalyzeBackup();
  const { mutateAsync: executeRestore } = useRestoreBackup();

  const refreshStatus = useCallback(async () => {
    setStatus(await getGoogleDriveStatus());
    setLastSync(await getLastSyncTime());
  }, []);

  useEffect(() => {
    refreshStatus();
    const onSynced = () => void refreshStatus();
    window.addEventListener(SYNCED_EVENT, onSynced);
    return () => window.removeEventListener(SYNCED_EVENT, onSynced);
  }, [refreshStatus]);

  const runSync = async (quiet = false) => {
    try {
      setBusy("sync");
      const result = await syncNow();
      if (result.applied > 0) await queryClient.invalidateQueries();
      if (!quiet) {
        toast.success(
          result.applied > 0
            ? `Synced: ${result.applied} change${result.applied === 1 ? "" : "s"} from your other devices.`
            : "Everything is in sync.",
        );
      }
    } catch (e) {
      toast.error(errorText(e, "Sync failed."));
    } finally {
      setBusy(null);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setIsSigningIn(true);
      const res = await signInWithGoogle(customClientId.trim() || undefined);
      if (res.success) {
        await resetSyncProgress(); // possibly another account: send everything there
        await refreshStatus();
        toast.success(`Connected to Google Drive as ${res.email || "your Google account"}.`);
        await runSync(true);
      } else if (res.error) {
        toast.error(res.error);
      }
    } finally {
      setIsSigningIn(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectGoogleDrive();
      toast.info("Google Drive disconnected.");
    } catch (e) {
      toast.error(errorText(e, "Failed to disconnect."));
    }
    await refreshStatus();
  };

  const handleToggleAutoSync = (enabled: boolean) => {
    setAutoSyncEnabled(enabled);
    setStatus((p) => ({ ...p, autoSyncEnabled: enabled }));
    toast.info(enabled ? "Automatic background sync enabled." : "Automatic sync paused.");
  };

  /** Writes the visible backup file (readable by the mobile app and older versions). */
  const handleUploadBackupFile = async () => {
    try {
      setBusy("upload");
      const backup = await (await getRepository()).exportBackup({ include_maintenance_logs: true });
      await uploadBackupToGoogleDrive(backup);
      await refreshStatus();
      toast.success("Backup file saved to Google Drive.");
    } catch (e) {
      toast.error(errorText(e, "Backup upload failed."));
    } finally {
      setBusy(null);
    }
  };

  /** Adds vehicles from the backup file that aren't here yet; vehicles already here are left as they are. */
  const handleImportBackupFile = async () => {
    try {
      setBusy("download");
      const { backupData } = await downloadBackupFromGoogleDrive();
      const analysis = await analyzeBackup(backupData);
      if (analysis.new_vehicles.length === 0) {
        toast.info("The Drive backup file has no vehicles that aren't already here.");
        return;
      }
      await executeRestore({
        backup_data: backupData,
        plan: {
          vehicles_to_add: analysis.new_vehicles.map((v) => v.id_in_backup),
          conflict_resolutions: analysis.conflicting_vehicles.map((c) => ({ vin: c.vin, action: "skip" })),
        },
      });
      const skipped = analysis.conflicting_vehicles.length;
      toast.success(
        `Added ${analysis.new_vehicles.length} vehicle(s) from the Drive backup file` +
          (skipped ? `; kept your copy of ${skipped} already here.` : "."),
      );
    } catch (e) {
      toast.error(errorText(e, "Import failed."));
    } finally {
      setBusy(null);
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
            Keeps your devices in step through a private folder in your Google Drive. Changes made on each device are merged.
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
            {lastSync && (
              <span className="text-muted-foreground font-mono text-[11px]">
                Last synced: {new Date(lastSync).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
          </div>

          <div className="flex items-center justify-between py-2 border-y border-border/40 text-xs">
            <div>
              <p className="font-medium text-foreground">Automatic Background Sync</p>
              <p className="text-[11px] text-muted-foreground">
                Sync at start, every few minutes, when the window is focused and after each change.
              </p>
            </div>
            <Switch checked={status.autoSyncEnabled} onCheckedChange={handleToggleAutoSync} />
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            <Button size="sm" onClick={() => runSync()} disabled={busy !== null} className="h-8 text-xs font-medium gap-1.5">
              <RotateCw className={`h-3.5 w-3.5 ${busy === "sync" ? "animate-spin" : ""}`} />
              {busy === "sync" ? "Syncing..." : "Sync Now"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleUploadBackupFile}
              disabled={busy !== null}
              className="h-8 text-xs gap-1.5"
              title={`Writes carbaddie_backup.json to your Drive${status.lastBackupTime ? ` (last: ${new Date(status.lastBackupTime).toLocaleString()})` : ""}`}
            >
              <Upload className="h-3.5 w-3.5" />
              {busy === "upload" ? "Saving..." : "Save backup file"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={handleImportBackupFile}
              disabled={busy !== null}
              className="h-8 text-xs gap-1.5"
              title="Adds vehicles from carbaddie_backup.json (e.g. written by the mobile app) that aren't here yet"
            >
              <Download className="h-3.5 w-3.5" />
              {busy === "download" ? "Importing..." : "Import backup file"}
            </Button>
          </div>
        </div>
      ) : (
        <div className="pt-3 border-t border-border/60 space-y-3">
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
            Sign in to sync your garage between devices through your personal Google Drive.
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
            <div className="p-3 rounded-lg border border-border/60 bg-background/50 space-y-1">
              <label className="text-[11px] font-medium text-foreground">Custom Google Client ID (Optional)</label>
              <Input
                placeholder="Enter custom OAuth Client ID"
                value={customClientId}
                onChange={(e) => setCustomClientId(e.target.value)}
                className="h-7 text-xs font-mono bg-background"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
