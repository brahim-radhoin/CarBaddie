import { useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useTheme } from "next-themes";
import { Monitor, Moon, RotateCcw, Sun } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SegmentedControl, type SegmentedOption } from "@/components/interior/segmented-control";
import { ACCENTS, type AccentId } from "@/lib/accent";
import { useAppPreferences } from "./AppPreferencesProvider";

const SPRING = { type: "spring", stiffness: 520, damping: 34, mass: 0.45 } as const;

const iconOption = (value: string, label: string, Icon: typeof Sun): SegmentedOption => ({
  value,
  ariaLabel: label,
  label: (
    <span className="flex items-center justify-center gap-1.5">
      <Icon className="h-3.5 w-3.5" aria-hidden />
      {label}
    </span>
  ),
});

const MODE_OPTIONS: SegmentedOption[] = [
  iconOption("light", "Light", Sun),
  iconOption("dark", "Dark", Moon),
  iconOption("system", "System", Monitor),
];

/** Light, dark or follow the system. Used here and, icon-only, in the sidebar. */
export function ModeControl({ compact = false }: { compact?: boolean }) {
  const { theme, setTheme } = useTheme();
  return (
    <SegmentedControl
      label="Colour mode"
      options={
        compact
          ? [
              { value: "light", ariaLabel: "Light", label: <Sun className="h-4 w-4" aria-hidden /> },
              { value: "dark", ariaLabel: "Dark", label: <Moon className="h-4 w-4" aria-hidden /> },
              { value: "system", ariaLabel: "System", label: <Monitor className="h-4 w-4" aria-hidden /> },
            ]
          : MODE_OPTIONS
      }
      compact={compact}
      value={theme ?? "system"}
      onValueChange={setTheme}
    />
  );
}

function AccentSwatches({ value, onChange }: { value: AccentId; onChange: (id: AccentId) => void }) {
  const reduced = useReducedMotion();
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const index = ACCENTS.findIndex((a) => a.id === value);

  const go = (i: number) => {
    const next = (i + ACCENTS.length) % ACCENTS.length;
    buttons.current[next]?.focus();
    onChange(ACCENTS[next].id);
  };

  return (
    <div role="radiogroup" aria-label="Accent colour" className="flex items-center gap-1">
      {ACCENTS.map((a, i) => {
        const selected = a.id === value;
        return (
          <button
            key={a.id}
            ref={(node) => {
              buttons.current[i] = node;
            }}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={a.label}
            title={a.label}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(a.id)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                e.preventDefault();
                go(index + 1);
              } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                e.preventDefault();
                go(index - 1);
              }
            }}
            className="relative grid h-9 w-9 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            {selected && (
              <motion.span
                layoutId="accent-ring"
                aria-hidden
                className="absolute inset-0 rounded-full ring-2 ring-foreground"
                transition={reduced ? { duration: 0 } : SPRING}
              />
            )}
            <span aria-hidden className="h-5 w-5 rounded-full" style={{ backgroundColor: `var(--accent-${a.id})` }} />
          </button>
        );
      })}
    </div>
  );
}

/** What the accent touches, drawn with the real nav-item class and chart-series colours. */
function AccentPreview() {
  const bars = [38, 52, 30, 64, 46, 72];
  return (
    <div aria-hidden className="pointer-events-none flex select-none items-end gap-6 rounded-md border border-border bg-background p-4">
      <div className="w-40 space-y-1">
        <div className="sidebar-nav-item active">Overview</div>
        <div className="sidebar-nav-item">Service types</div>
      </div>
      <div className="flex-1">
        <p className="mb-2 text-xs text-muted-foreground">Cost by month</p>
        <div className="flex h-16 items-end gap-2">
          {bars.map((h, i) => (
            <div
              key={i}
              className={`flex-1 rounded-sm ${i === bars.length - 1 ? "bg-brand-accent" : "bg-foreground/15"}`}
              style={{ height: `${h}%` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export function AppearanceSection() {
  const { setTheme } = useTheme();
  const { accent, setAccent, backgroundImage, setBackgroundImage, resetPreferences } = useAppPreferences();
  const [imageUrl, setImageUrl] = useState(backgroundImage ?? "");
  const accentLabel = ACCENTS.find((a) => a.id === accent)?.label;

  const applyImage = () => {
    const url = imageUrl.trim();
    if (!setBackgroundImage(url || null)) {
      toast.error("Only embedded images work here. Paste a data:image address, not a web link.");
    }
  };

  const clearImage = () => {
    setImageUrl("");
    setBackgroundImage(null);
  };

  const reset = () => {
    resetPreferences();
    setTheme("system");
    setImageUrl("");
    toast.success("Appearance reset");
  };

  return (
    <div className="space-y-5 rounded-lg border border-border bg-card p-5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-foreground">Mode</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Light, dark, or follow your computer</p>
        </div>
        <ModeControl />
      </div>

      <div className="space-y-4 border-t border-border/60 pt-4">
        <div className="flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-foreground">Accent</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Focus ring, the main chart series and the active menu item. Currently {accentLabel?.toLowerCase()}
            </p>
          </div>
          <AccentSwatches value={accent} onChange={setAccent} />
        </div>
        <AccentPreview />
      </div>

      <div className="border-t border-border/60 pt-4">
        <p className="text-sm font-medium text-foreground">Background image</p>
        <p className="mb-3 mt-0.5 text-xs text-muted-foreground">
          Optional. Paste an embedded image (a data:image address); web links are not loaded
        </p>
        <div className="flex gap-2">
          <Input
            aria-label="Background image address"
            placeholder="data:image/png;base64,..."
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            className="h-8 flex-1 bg-background font-mono text-xs"
          />
          <Button size="sm" onClick={applyImage} className="h-8 px-3 text-xs">
            Apply
          </Button>
          {backgroundImage && (
            <Button variant="outline" size="sm" onClick={clearImage} className="h-8 px-3 text-xs">
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="flex justify-end border-t border-border/60 pt-4">
        <Button variant="outline" size="sm" onClick={reset} className="h-8 px-3 text-xs text-muted-foreground hover:text-foreground">
          <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
          Reset appearance
        </Button>
      </div>
    </div>
  );
}
