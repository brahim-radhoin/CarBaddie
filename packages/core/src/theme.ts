// The one palette both apps draw from: a graphite ramp, one accent, and three status colours.
//
// Mobile builds its theme straight from this file. Desktop writes the same values into
// apps/desktop/src/index.css (CSS cannot import TypeScript), and test/theme.test.ts fails when the
// two drift apart or when a text colour drops under 4.5:1 on its surface.

export type ColorScheme = "light" | "dark";

export interface Palette {
  background: string;
  card: string;
  /** Inputs, chips and segmented-control tracks: one step above `card`. */
  raised: string;
  border: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  /** The action colour: ink on light, off-white on dark. */
  primary: string;
  onPrimary: string;
  danger: string;
  dangerBg: string;
  warn: string;
  warnBg: string;
  ok: string;
  okBg: string;
}

export const PALETTES: Record<ColorScheme, Palette> = {
  light: {
    background: "#fafafa",
    card: "#ffffff",
    raised: "#f4f4f5",
    border: "rgba(0,0,0,0.08)",
    text: "#171717",
    textSecondary: "#52525b",
    textMuted: "#6b6b73",
    primary: "#171717",
    onPrimary: "#fafafa",
    danger: "#b91c1c",
    dangerBg: "rgba(185,28,28,0.08)",
    warn: "#b45309",
    warnBg: "rgba(180,83,9,0.08)",
    ok: "#047857",
    okBg: "rgba(4,120,87,0.08)",
  },
  dark: {
    background: "#121213",
    card: "#18181a",
    raised: "#222225",
    border: "rgba(255,255,255,0.08)",
    text: "#ededed",
    textSecondary: "#a1a1aa",
    textMuted: "#8a8a93",
    primary: "#f4f4f5",
    onPrimary: "#121213",
    danger: "#f87171",
    dangerBg: "rgba(248,113,113,0.12)",
    warn: "#fbbf24",
    warnBg: "rgba(251,191,36,0.12)",
    ok: "#34d399",
    okBg: "rgba(52,211,153,0.12)",
  },
};

/**
 * The accent: focus ring, main chart series, the active menu item. A choice of a few curated
 * colours, each with a shade for light and for dark that reads at 4.5:1 on cards and backgrounds.
 */
export const ACCENTS = [
  { id: "amber", label: "Amber", light: "#b45309", dark: "#f59e0b" },
  { id: "blue", label: "Blue", light: "#1d4ed8", dark: "#60a5fa" },
  { id: "green", label: "Green", light: "#047857", dark: "#34d399" },
  { id: "rose", label: "Rose", light: "#be123c", dark: "#fb7185" },
  { id: "violet", label: "Violet", light: "#6d28d9", dark: "#a78bfa" },
  { id: "graphite", label: "Graphite", light: "#171717", dark: "#f4f4f5" },
] as const;

export type AccentId = (typeof ACCENTS)[number]["id"];

export const DEFAULT_ACCENT: AccentId = "amber";

export type ThemeMode = "system" | "light" | "dark";

/** Device-local app_settings keys (the choice is per device, like reminders). Missing means system / amber. */
export const APPEARANCE_SETTING_KEYS = { mode: "appearance.mode", accent: "appearance.accent" } as const;

export function isAccentId(value: unknown): value is AccentId {
  return ACCENTS.some((a) => a.id === value);
}

export function isThemeMode(value: unknown): value is ThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

/** The accent's shade for a scheme. */
export function accentColor(id: AccentId, scheme: ColorScheme): string {
  const found = ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];
  return found[scheme];
}
