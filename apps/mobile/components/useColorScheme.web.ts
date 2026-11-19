import { useAppearance } from "@/src/appearance";

// Web has no server-side way to know the visitor's scheme, so "system" renders light.
export function useColorScheme(): "light" | "dark" {
  return useAppearance().mode === "dark" ? "dark" : "light";
}
