import { useColorScheme as useSystemScheme } from "react-native";
import { useAppearance } from "@/src/appearance";

/** The scheme in use: the user's choice, or the phone's when they chose "system". */
export const useColorScheme = (): "light" | "dark" => {
  const system = useSystemScheme();
  const { mode } = useAppearance();
  return mode === "system" ? (system === "dark" ? "dark" : "light") : mode;
};
