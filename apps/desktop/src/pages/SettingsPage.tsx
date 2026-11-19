import { useEffect, useState } from "react";
import { AppearanceSection } from "../components/AppearanceSection";
import { useAppVersion } from "../hooks/useAppVersion";
import { useVehicles, useServiceTypes, useExportBackup, useWipeDatabase, useSetPreference } from "../api";
import { COMMON_CURRENCIES, getRemindersEnabled, setRemindersEnabled, todayISO } from "@carbaddie/core";
import { getRepository } from "../db";
import { checkRemindersNow } from "../hooks/useReminders";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUnits } from "../hooks/useUnits";
import { GoogleDriveSyncSection } from "../components/GoogleDriveSyncSection";
import { RestoreSection } from "../components/RestoreSection";
import { Button } from "@/components/ui/button";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  ChevronLeft,
  Car,
  Wrench,
  FileText,
  Download,
  AlertTriangle,
} from "lucide-react";

export function SettingsPage() {
  const version = useAppVersion();
  const { data: allVehicles = [] } = useVehicles();
  const { data: allServiceTypes = [] } = useServiceTypes();
  const totalLogs = allVehicles.reduce(
    (acc, v) => acc + (v.maintenance_logs?.length ?? 0),
    0
  );

  const { mutateAsync: exportBackup, isPending: isExporting } =
    useExportBackup();
  const { mutateAsync: wipeDatabase, isPending: isWiping } =
    useWipeDatabase();

  // Currency and distance unit are synced to your other devices.
  const units = useUnits();
  const { mutate: setPreference } = useSetPreference();
  const currencies = COMMON_CURRENCIES.includes(units.currency as (typeof COMMON_CURRENCIES)[number])
    ? [...COMMON_CURRENCIES]
    : [units.currency, ...COMMON_CURRENCIES];

  // Reminders are a device-local setting (app_settings), not a synced preference.
  const [remindersOn, setRemindersOn] = useState(true);
  useEffect(() => {
    getRepository().then(getRemindersEnabled).then(setRemindersOn).catch(() => undefined);
  }, []);
  const handleToggleReminders = async (enabled: boolean) => {
    setRemindersOn(enabled);
    try {
      await setRemindersEnabled(await getRepository(), enabled);
    } catch {
      toast.error("Could not save the reminder setting");
      return;
    }
    if (enabled) checkRemindersNow().catch((error) => console.warn("Reminder check failed:", error));
  };

  const handleExport = async () => {
    try {
      const blob = await exportBackup({ include_maintenance_logs: true });
      const text = await blob.text();
      const url = URL.createObjectURL(
        new Blob([text], { type: "application/json" })
      );
      const timestamp = todayISO();
      const a = document.createElement("a");
      a.href = url;
      a.download = `carbaddie_backup_${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Backup exported");
    } catch {
      toast.error("Could not export the backup");
    }
  };

  const [showWipeConfirm, setShowWipeConfirm] = useState(false);

  const handleWipe = async () => {
    try {
      await wipeDatabase();
      setShowWipeConfirm(false);
    } catch {
      // error toast handled by the hook
    }
  };

  return (
    <div className="max-w-3xl space-y-6">
      {/* Contextual Header */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground pb-4 border-b border-border">
        <Link
          to="/vehicles"
          className="hover:text-foreground transition-colors flex items-center gap-1"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Overview</span>
        </Link>
        <span className="opacity-40">/</span>
        <span className="font-medium text-foreground">Settings</span>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-medium tracking-tight text-foreground">
            Settings
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Sync, preferences, appearance and backup
          </p>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────── */}
      {/* SECTION 1: CLOUD SYNC                               */}
      {/* ──────────────────────────────────────────────────── */}
      <SectionHeader label="Sync" />
      <GoogleDriveSyncSection />

      {/* ──────────────────────────────────────────────────── */}
      {/* SECTION 2: GARAGE TELEMETRY & PREFERENCES            */}
      {/* ──────────────────────────────────────────────────── */}
      <SectionHeader label="Preferences" />
      <div className="rounded-lg border border-border bg-card p-5 space-y-5">
        {/* KPI Stats */}
        <div>
          <h3 className="text-sm font-medium text-foreground mb-1">
            Totals
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Stored on this computer
          </p>
          <div className="grid grid-cols-3 gap-4 text-center">
            <KpiCard icon={Car} value={allVehicles.length} label="Vehicles" />
            <KpiCard icon={FileText} value={totalLogs} label="Service logs" />
            <KpiCard
              icon={Wrench}
              value={allServiceTypes.length}
              label="Service types"
            />
          </div>
        </div>

        {/* Distance Units */}
        <div className="flex items-center justify-between pt-4 border-t border-border/60">
          <div>
            <p className="text-sm font-medium text-foreground">
              Distance units
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Odometer and intervals; stored in km, so switching converts what you see
            </p>
          </div>
          <PillSelector
            options={[
              { value: "km", label: "km" },
              { value: "mi", label: "miles" },
            ]}
            selected={units.unit}
            onSelect={(v) => setPreference({ key: "distance_unit", value: v })}
          />
        </div>

        {/* Currency */}
        <div className="flex items-center justify-between pt-4 border-t border-border/60">
          <div>
            <p className="text-sm font-medium text-foreground">
              Currency
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              All costs are shown in it; changing it doesn't convert amounts
            </p>
          </div>
          <Select value={units.currency} onValueChange={(v) => setPreference({ key: "currency", value: v })}>
            <SelectTrigger className="h-8 w-28 text-xs font-mono">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {currencies.map((code) => (
                <SelectItem key={code} value={code} className="text-xs font-mono">
                  {code}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Maintenance reminders (this device only) */}
        <div className="flex items-center justify-between pt-4 border-t border-border/60">
          <div>
            <p className="text-sm font-medium text-foreground">
              Maintenance reminders
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              A notification on this computer when a service is due soon or overdue
            </p>
          </div>
          <Switch
            checked={remindersOn}
            onCheckedChange={handleToggleReminders}
            aria-label="Maintenance reminders"
          />
        </div>
      </div>

      {/* ──────────────────────────────────────────────────── */}
      {/* SECTION 3: APPEARANCE                                */}
      {/* ──────────────────────────────────────────────────── */}
      <SectionHeader label="Appearance" />
      <AppearanceSection />

      {/* ──────────────────────────────────────────────────── */}
      {/* SECTION 4: LOCAL DATA & BACKUP                       */}
      {/* ──────────────────────────────────────────────────── */}
      <SectionHeader label="Data and backup" />
      <div className="rounded-lg border border-border bg-card divide-y divide-border">
        {/* Export */}
        <button
          type="button"
          onClick={handleExport}
          disabled={isExporting}
          className="w-full flex items-center gap-3 px-5 py-4 text-left hover:bg-secondary/40 transition-colors disabled:opacity-50 cursor-pointer"
        >
          <Download className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">
              Export Offline Backup (JSON)
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Download your entire fleet database as a file
            </p>
          </div>
          {isExporting ? (
            <div className="h-4 w-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          ) : (
            <ChevronLeft className="h-4 w-4 text-muted-foreground/40 rotate-180" />
          )}
        </button>
      </div>

      {/* Import / Restore — existing full component */}
      <RestoreSection />

      {/* ──────────────────────────────────────────────────── */}
      {/* SECTION 5: DANGER ZONE                               */}
      {/* ──────────────────────────────────────────────────── */}
      <SectionHeader label="Danger zone" variant="destructive" />
      <div className="rounded-lg border border-destructive/20 bg-card p-5">
        <div className="flex items-start gap-4">
          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive">
              Wipe garage database
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Permanently delete all vehicles, maintenance logs, and interval
              overrides. This cannot be undone.
            </p>
          </div>
          {!showWipeConfirm ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowWipeConfirm(true)}
              className="h-8 text-xs px-3 text-destructive border-destructive/30 hover:bg-destructive/10 flex-shrink-0"
            >
              Wipe all
            </Button>
          ) : (
            <div className="flex items-center gap-2 flex-shrink-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowWipeConfirm(false)}
                className="h-8 text-xs px-3"
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                size="sm"
                onClick={handleWipe}
                disabled={isWiping}
                className="h-8 text-xs px-3"
              >
                {isWiping ? "Wiping" : "Confirm wipe"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pb-8 pt-2">
        <p className="text-xs text-muted-foreground/50">
          CarBaddie {version}
        </p>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   Tiny helper components scoped to this page
   ═══════════════════════════════════════════════════════════════ */

function SectionHeader({
  label,
  variant = "default",
}: {
  label: string;
  variant?: "default" | "destructive";
}) {
  return (
    <p
      className={`text-xs font-semibold px-1 ${
        variant === "destructive" ? "text-destructive" : "text-primary"
      }`}
    >
      {label}
    </p>
  );
}

function KpiCard({
  icon: Icon,
  value,
  label,
}: {
  icon: React.ComponentType<{ className?: string }>;
  value: number;
  label: string;
}) {
  return (
    <div className="p-3 rounded-md bg-secondary/40 border border-border/60">
      <Icon className="h-4 w-4 mx-auto mb-1 text-muted-foreground" />
      <p className="text-lg font-semibold text-foreground font-mono">{value}</p>
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
    </div>
  );
}

function PillSelector({
  options,
  selected,
  onSelect,
}: {
  options: { value: string; label: string }[];
  selected: string;
  onSelect: (value: string) => void;
}) {
  return (
    <div className="flex rounded-lg border border-border bg-background p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onSelect(opt.value)}
          className={`px-3 py-1 rounded-md text-xs font-semibold transition-colors cursor-pointer ${
            selected === opt.value
              ? "bg-primary text-primary-foreground"
              : "text-foreground hover:bg-secondary/60"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

