/**
 * The app's font: Geist (the desktop's font too), one bundled file per weight.
 *
 * Text never relies on `fontWeight` with the system font. On an Android phone, semi-bold labels were
 * measured narrower than they were drawn, so their end wrapped onto a hidden line ("Delete" showed
 * as "Delet", "Save reading" as "Save") and centred text sat left. A family per weight is meant to
 * make measuring and drawing use the same file. Themed Text and TextInput apply it from
 * `fontWeight`; anything else (navigation, headers) uses `font()`.
 */
import { Geist_400Regular } from "@expo-google-fonts/geist/400Regular";
import { Geist_500Medium } from "@expo-google-fonts/geist/500Medium";
import { Geist_600SemiBold } from "@expo-google-fonts/geist/600SemiBold";
import type { TextStyle } from "react-native";

/** For expo-font's useFonts in the root layout. */
export const FONT_FILES = { Geist_400Regular, Geist_500Medium, Geist_600SemiBold };

/** Weights run 400 to 600 (the UI contract); heavier asks get 600. */
export function fontFamilyFor(weight: TextStyle["fontWeight"]): string {
  const w = weight === "bold" ? 700 : weight == null || weight === "normal" ? 400 : Number(weight);
  return w >= 600 ? "Geist_600SemiBold" : w >= 500 ? "Geist_500Medium" : "Geist_400Regular";
}

/** Style for a weight, without `fontWeight` (which would make Android fake-bold the file). */
export function font(weight?: TextStyle["fontWeight"]): { fontFamily: string } {
  return { fontFamily: fontFamilyFor(weight) };
}

/** A flattened style with its weight turned into a family. A style naming its own family keeps it. */
export function withFont<S extends TextStyle>(style: S): S {
  if (style.fontFamily) return style;
  const { fontWeight, ...rest } = style;
  return { ...rest, fontFamily: fontFamilyFor(fontWeight) } as S;
}
