/**
 * The mobile theme. The colours come from @carbaddie/core (the palette the desktop app shares and a
 * test keeps in step); this file only adds the accent the user picked and the navigation theme.
 *
 * `primary` is the action colour (ink on light, off-white on dark), so a primary button is always
 * `backgroundColor: primary` + `color: onPrimary`. `accent` marks selection and links.
 */
import { DarkTheme, DefaultTheme } from "expo-router";
import { useMemo } from "react";
import { DEFAULT_ACCENT, PALETTES, accentColor, type AccentId, type ColorScheme, type Palette as SharedPalette } from "@carbaddie/core";
import { useColorScheme } from "@/components/useColorScheme";
import { useAppearance } from "@/src/appearance";

export type Palette = SharedPalette & {
  accent: string;
  notification: string;
  /** The stroke of the vehicle outlines. One token, so it is easy to change (it is neutral for now). */
  outline: string;
};

export function buildPalette(scheme: ColorScheme, accent: AccentId = DEFAULT_ACCENT): Palette {
  const p = PALETTES[scheme];
  return { ...p, accent: accentColor(accent, scheme), notification: p.danger, outline: p.text };
}

/** Default-accent palettes, for the few places that cannot call a hook (Themed text defaults). */
export const palettes: Record<ColorScheme, Palette> = {
  light: buildPalette("light"),
  dark: buildPalette("dark"),
};

/** Navigation theme built from the same palette, so headers and tab bars never drift from screens. */
export function navigationTheme(scheme: ColorScheme, accent: AccentId) {
  const p = buildPalette(scheme, accent);
  const base = scheme === "dark" ? DarkTheme : DefaultTheme;
  return {
    ...base,
    colors: { ...base.colors, primary: p.primary, background: p.background, card: p.card, text: p.text, border: p.border, notification: p.notification },
  };
}

/** Drop-in replacement for expo-router's `useTheme()` with the extra tokens and the chosen accent. */
export function useTheme() {
  const scheme = useColorScheme();
  const { accent } = useAppearance();
  const colors = useMemo(() => buildPalette(scheme, accent), [scheme, accent]);
  return { colors, dark: scheme === "dark" };
}

/** Numbers that line up in a column: costs, odometer, counts. */
export const figures = { fontVariant: ["tabular-nums" as const] };

/** Minimum touch target (dp) from Material and WCAG 2.2. */
export const TOUCH = 48;
