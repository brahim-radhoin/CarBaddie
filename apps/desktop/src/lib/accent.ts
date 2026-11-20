/**
 * The accent colour: one of a few curated choices, stored on this device and applied as
 * `data-accent` on <html>. index.css maps each id to a light and a dark shade (both at least 4.5:1
 * on the surfaces). Primary and the neutral surfaces never change; only the focus ring, the main
 * chart series and the active navigation marker follow the accent.
 */
import { ACCENTS, DEFAULT_ACCENT, isAccentId, isOutlineColour, type AccentId, type OutlineColour } from "@carbaddie/core";

export { ACCENTS, DEFAULT_ACCENT, isAccentId };
export type { AccentId, OutlineColour };

const KEY = "app_accent";
/** Keys from the old free-text colour pickers, which wrote indigo/green over the whole theme. */
const OLD_KEYS = ["app_primary_color", "app_accent_color"];

export function readStoredAccent(): AccentId {
  try {
    const stored = localStorage.getItem(KEY);
    return isAccentId(stored) ? stored : DEFAULT_ACCENT;
  } catch {
    return DEFAULT_ACCENT;
  }
}

export function applyAccent(id: AccentId) {
  const root = document.documentElement;
  if (id === DEFAULT_ACCENT) root.removeAttribute("data-accent");
  else root.setAttribute("data-accent", id);
}

export function storeAccent(id: AccentId) {
  try {
    if (id === DEFAULT_ACCENT) localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, id);
  } catch {
    // Private mode or blocked storage: the choice just lasts for this session.
  }
}

const OUTLINE_KEY = "app_outline";

/** The vehicle outline's colour: neutral (the text colour) unless the user picked the accent. */
export function readStoredOutline(): OutlineColour {
  try {
    const stored = localStorage.getItem(OUTLINE_KEY);
    return isOutlineColour(stored) ? stored : "neutral";
  } catch {
    return "neutral";
  }
}

/** Applied as `data-outline` on <html>; index.css maps it to `--outline`. */
export function applyOutline(outline: OutlineColour) {
  if (outline === "neutral") document.documentElement.removeAttribute("data-outline");
  else document.documentElement.setAttribute("data-outline", outline);
}

export function storeOutline(outline: OutlineColour) {
  try {
    if (outline === "neutral") localStorage.removeItem(OUTLINE_KEY);
    else localStorage.setItem(OUTLINE_KEY, outline);
  } catch {
    // Blocked storage: the choice just lasts for this session.
  }
}

/** Call once before the first render so the page never paints in the wrong accent or outline. */
export function initAccent() {
  try {
    OLD_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch {
    // ignore
  }
  applyAccent(readStoredAccent());
  applyOutline(readStoredOutline());
}
