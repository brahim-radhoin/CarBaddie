import { useEffect, useState } from "react";
import { useAppPreferences } from "../components/AppPreferencesProvider";
import { useVehicles, useServiceTypes, useExportBackup, useWipeDatabase, useSetPreference } from "../api";
import { COMMON_CURRENCIES, getRemindersEnabled, setRemindersEnabled } from "@carbaddie/core";
import { getRepository } from "../db";
import { checkRemindersNow } from "../hooks/useReminders";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useUnits } from "../hooks/useUnits";
import { GoogleDriveSyncSection } from "../components/GoogleDriveSyncSection";
import { RestoreSection } from "../components/RestoreSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTheme } from "next-themes";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import {
  ChevronLeft,
  RotateCcw,
  Car,
  Wrench,
  FileText,
  Database,
  Download,
  AlertTriangle,
  Sun,
  Moon,
  Monitor,
  Palette,
  Image as ImageIcon,
} from "lucide-react";

export function SettingsPage() {
  const {
    primaryColor,
    setPrimaryColor,
    accentColor,
    setAccentColor,
    backgroundImage,
    setBackgroundImage,
    resetPreferences,
  } = useAppPreferences();

  const { theme, setTheme } = useTheme();
  const [imageUrl, setImageUrl] = useState(backgroundImage || "");

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
      toast.error("Failed to save the reminder setting.");
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
      const timestamp = new Date().toISOString().slice(0, 10);
      const a = document.createElement("a");
      a.href = url;
      a.download = `carbaddie_backup_${timestamp}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Backup exported successfully.");
    } catch {
      toast.error("Failed to export backup.");
    }
  };

  const handleImageSave = () => {
    setBackgroundImage(imageUrl.trim() || null);
  };

  const handleImageClear = () => {
    setImageUrl("");
    setBackgroundImage(null);
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
        <span className="font-medium text-foreground">Preferences</span>
      </div>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-medium tracking-tight text-foreground">
            System Preferences
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Cloud sync, garage telemetry, appearance, and data management.
          </p>
        </div>
        <div className="hidden sm:flex items-center gap-2 text-xs font-mono text-muted-foreground bg-secondary/50 px-2.5 py-1 rounded border border-border">
          <Database className="h-3 w-3 text-primary" />
          <span>SQLite WAL</span>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────── */}
      {/* SECTION 1: CLOUD SYNC                               */}
      {/* ──────────────────────────────────────────────────── */}
      <SectionHeader label="CLOUD SYNCHRONIZATION" />
      <GoogleDriveSyncSection />

      {/* ──────────────────────────────────────────────────── */}
      {/* SECTION 2: GARAGE TELEMETRY & PREFERENCES            */}
      {/* ──────────────────────────────────────────────────── */}
      <SectionHeader label="GARAGE PREFERENCES" />
      <div className="rounded-lg border border-border bg-card p-5 space-y-5">
        {/* KPI Stats */}
        <div>
          <h3 className="text-sm font-medium text-foreground mb-1">
            Garage Telemetry
          </h3>
          <p className="text-xs text-muted-foreground mb-4">
            Live totals stored in the local SQLite database.
          </p>
          <div className="grid grid-cols-3 gap-4 text-center">
            <KpiCard icon={Car} value={allVehicles.length} label="Vehicles" />
            <KpiCard icon={FileText} value={totalLogs} label="Service Logs" />
            <KpiCard
              icon={Wrench}
              value={allServiceTypes.length}
              label="Categories"
            />
          </div>
        </div>

        {/* Distance Units */}
        <div className="flex items-center justify-between pt-4 border-t border-border/60">
          <div>
            <p className="text-sm font-medium text-foreground">
              Distance Units
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
      <SectionHeader label="APPEARANCE" />
      <div className="rounded-lg border border-border bg-card p-5 space-y-5">
        {/* Theme Mode */}
        <div>
          <h3 className="text-sm font-medium text-foreground">Theme Mode</h3>
          <p className="text-xs text-muted-foreground mt-0.5 mb-3">
            Choose between dark graphite telemetry or clean light mode.
          </p>
          <div className="flex gap-2">
            <ThemeButton
              icon={Moon}
              label="Dark"
              active={theme === "dark"}
              onClick={() => setTheme("dark")}
            />
            <ThemeButton
              icon={Sun}
              label="Light"
              active={theme === "light"}
              onClick={() => setTheme("light")}
            />
            <ThemeButton
              icon={Monitor}
              label="System"
              active={theme === "system"}
              onClick={() => setTheme("system")}
            />
          </div>
        </div>

        {/* Color Customization */}
        <div className="pt-4 border-t border-border/60">
          <div className="flex items-center gap-2 mb-3">
            <Palette className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-sm font-medium text-foreground">
              Color Customization
            </h3>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label
                htmlFor="primary-color"
                className="text-xs text-muted-foreground"
              >
                Primary Surface
              </Label>
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded border border-border flex-shrink-0"
                  style={{ backgroundColor: primaryColor }}
                />
                <Input
                  id="primary-color"
                  value={primaryColor}
                  onChange={(e) => setPrimaryColor(e.target.value)}
                  placeholder="oklch(...) or hex"
                  className="h-8 text-xs font-mono bg-background"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label
                htmlFor="accent-color"
                className="text-xs text-muted-foreground"
              >
                Accent Highlight
              </Label>
              <div className="flex items-center gap-2">
                <div
                  className="w-7 h-7 rounded border border-border flex-shrink-0"
                  style={{ backgroundColor: accentColor }}
                />
                <Input
                  id="accent-color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  placeholder="oklch(...) or hex"
                  className="h-8 text-xs font-mono bg-background"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Custom Backdrop */}
        <div className="pt-4 border-t border-border/60">
          <div className="flex items-center gap-2 mb-3">
            <ImageIcon className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-sm font-medium text-foreground">
              Custom Backdrop
            </h3>
          </div>
          <p className="text-xs text-muted-foreground mb-2">
            Optional wallpaper URL applied with reduced opacity.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="https://images.unsplash.com/..."
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              className="h-8 text-xs font-mono bg-background flex-1"
            />
            <Button
              size="sm"
              onClick={handleImageSave}
              className="h-8 text-xs px-3"
            >
              Apply
            </Button>
            {backgroundImage && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleImageClear}
                className="h-8 text-xs px-3"
              >
                Clear
              </Button>
            )}
          </div>
        </div>

        {/* Reset All */}
        <div className="pt-4 border-t border-border/60 flex justify-end">
          <Button
            variant="outline"
            size="sm"
            onClick={resetPreferences}
            className="h-8 text-xs px-3 text-muted-foreground hover:text-destructive"
          >
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
            Reset Theme to Defaults
          </Button>
        </div>
      </div>

      {/* ──────────────────────────────────────────────────── */}
      {/* SECTION 4: LOCAL DATA & BACKUP                       */}
      {/* ──────────────────────────────────────────────────── */}
      <SectionHeader label="LOCAL DATA & BACKUP" />
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
      <SectionHeader label="DANGER ZONE" variant="destructive" />
      <div className="rounded-lg border border-destructive/20 bg-card p-5">
        <div className="flex items-start gap-4">
          <AlertTriangle className="h-5 w-5 text-destructive flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-destructive">
              Wipe Garage Database
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
              Wipe All
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
                {isWiping ? "Wiping..." : "Confirm Wipe"}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="text-center pb-8 pt-2">
        <p className="text-[11px] text-muted-foreground/50 tracking-wide">
          CarBaddie v1.0.0 • SQLite WAL Engine • Unslop Edition
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
      className={`text-[11px] font-semibold tracking-wider px-1 ${
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
      <p className="text-lg font-bold text-foreground font-mono">{value}</p>
      <p className="text-[11px] text-muted-foreground font-medium">{label}</p>
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

function ThemeButton({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      variant={active ? "default" : "outline"}
      size="sm"
      onClick={onClick}
      className="h-8 text-xs px-4 gap-1.5"
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </Button>
  );
}
