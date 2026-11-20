/**
 * Colour mode (system, light, dark), accent, outline colour and the looping garage deck, chosen per
 * device and kept in app_settings like the reminder switch. A tiny store so any screen can read it
 * with `useAppearance()` and the root layout can load it once at start.
 */
import { useSyncExternalStore } from "react";
import { Appearance } from "react-native";
import {
  APPEARANCE_SETTING_KEYS,
  DEFAULT_ACCENT,
  isAccentId,
  isOutlineColour,
  isThemeMode,
  type AccentId,
  type OutlineColour,
  type ThemeMode,
} from "@carbaddie/core";
import { getRepository } from "@/src/db/schema";

type State = { mode: ThemeMode; accent: AccentId; outline: OutlineColour; loopDeck: boolean };

let state: State = { mode: "system", accent: DEFAULT_ACCENT, outline: "neutral", loopDeck: false };
const listeners = new Set<() => void>();

function commit(next: State) {
  state = next;
  listeners.forEach((l) => l());
}

/** Native dialogs, keyboards and the status bar follow the OS unless told otherwise. */
function applyNative(mode: ThemeMode) {
  try {
    Appearance.setColorScheme(mode === "system" ? "unspecified" : mode);
  } catch {
    // Not supported on this platform (web): the app's own colours still switch.
  }
}

/** Read the saved choice once at start. Never throws; falls back to the defaults. */
export async function loadAppearance(): Promise<void> {
  try {
    const repo = await getRepository();
    const [mode, accent, outline, loopDeck] = await Promise.all([
      repo.getSetting(APPEARANCE_SETTING_KEYS.mode),
      repo.getSetting(APPEARANCE_SETTING_KEYS.accent),
      repo.getSetting(APPEARANCE_SETTING_KEYS.outline),
      repo.getSetting(APPEARANCE_SETTING_KEYS.loopDeck),
    ]);
    const next: State = {
      mode: isThemeMode(mode) ? mode : "system",
      accent: isAccentId(accent) ? accent : DEFAULT_ACCENT,
      outline: isOutlineColour(outline) ? outline : "neutral",
      loopDeck: loopDeck === "1",
    };
    applyNative(next.mode);
    commit(next);
  } catch {
    // Keep the defaults; a failed read must not stop the app opening.
  }
}

async function save(key: string, value: string, isDefault: boolean) {
  try {
    const repo = await getRepository();
    if (isDefault) await repo.removeSetting(key);
    else await repo.setSetting(key, value);
  } catch {
    // The choice still applies for this session.
  }
}

export function setMode(mode: ThemeMode) {
  applyNative(mode);
  commit({ ...state, mode });
  void save(APPEARANCE_SETTING_KEYS.mode, mode, mode === "system");
}

export function setAccent(accent: AccentId) {
  commit({ ...state, accent });
  void save(APPEARANCE_SETTING_KEYS.accent, accent, accent === DEFAULT_ACCENT);
}

export function setOutline(outline: OutlineColour) {
  commit({ ...state, outline });
  void save(APPEARANCE_SETTING_KEYS.outline, outline, outline === "neutral");
}

export function setLoopDeck(loopDeck: boolean) {
  commit({ ...state, loopDeck });
  void save(APPEARANCE_SETTING_KEYS.loopDeck, "1", !loopDeck);
}

export function useAppearance(): State {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => state,
    () => state
  );
}
