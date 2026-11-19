import { PALETTES, DEFAULT_ACCENT, accentColor } from "@carbaddie/core";

// Kept for the Themed text/view defaults; the values come from the shared palette in @carbaddie/core.
export default {
  light: { text: PALETTES.light.text, background: PALETTES.light.background, tint: accentColor(DEFAULT_ACCENT, "light"), tabIconDefault: PALETTES.light.textMuted, tabIconSelected: accentColor(DEFAULT_ACCENT, "light") },
  dark: { text: PALETTES.dark.text, background: PALETTES.dark.background, tint: accentColor(DEFAULT_ACCENT, "dark"), tabIconDefault: PALETTES.dark.textMuted, tabIconSelected: accentColor(DEFAULT_ACCENT, "dark") },
};
