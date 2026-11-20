/**
 * The mobile theme. The colours come from @carbaddie/core (the palette the desktop app shares and a
 * test keeps in step); this file only adds the accent the user picked and the navigation theme.
 *
 * `primary` is the action colour (ink on light, off-white on dark), so a primary button is always
 * `backgroundColor: primary` + `color: onPrimary`. `accent` marks selection and links.
 */
import { DarkTheme, DefaultTheme } from "expo-router";
import { useMemo } from "react";
import {
  DEFAULT_ACCENT,
  PALETTES,
  accentColor,
  type AccentId,
  type ColorScheme,
  type OutlineColour,
  type Palette as SharedPalette,
} from "@carbaddie/core";
import { useColorScheme } from "@/components/useColorScheme";
import { useAppearance } from "@/src/appearance";
import { font } from "@/src/fonts";

export { font };

export type Palette = SharedPalette & {
  accent: string;
  notification: string;
  /** The stroke of the vehicle outlines: the text colour, or the accent when the user picks it (Appearance). */
  outline: string;
};

export function buildPalette(scheme: ColorScheme, accent: AccentId = DEFAULT_ACCENT, outline: OutlineColour = "neutral"): Palette {
  const p = PALETTES[scheme];
  const accentShade = accentColor(accent, scheme);
  return { ...p, accent: accentShade, notification: p.danger, outline: outline === "accent" ? accentShade : p.text };
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
    // Headers and tab labels in the app font, by family not weight (see src/fonts.ts).
    fonts: {
      regular: { ...font("400"), fontWeight: "normal" as const },
      medium: { ...font("500"), fontWeight: "normal" as const },
      bold: { ...font("600"), fontWeight: "normal" as const },
      heavy: { ...font("600"), fontWeight: "normal" as const },
    },
  };
}

/** Drop-in replacement for expo-router's `useTheme()` with the extra tokens and the chosen accent. */
export function useTheme() {
  const scheme = useColorScheme();
  const { accent, outline } = useAppearance();
  const colors = useMemo(() => buildPalette(scheme, accent, outline), [scheme, accent, outline]);
  return { colors, dark: scheme === "dark" };
}

/** Numbers that line up in a column: costs, odometer, counts. */
export const figures = { fontVariant: ["tabular-nums" as const] };

/** Minimum touch target (dp) from Material and WCAG 2.2. */
export const TOUCH = 48;
