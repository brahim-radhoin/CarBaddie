import React, { createContext, useContext, useEffect, useState } from "react";
import {
  applyAccent,
  applyOutline,
  readStoredAccent,
  readStoredOutline,
  storeAccent,
  storeOutline,
  DEFAULT_ACCENT,
  type AccentId,
  type OutlineColour,
} from "@/lib/accent";

type AppPreferencesContextType = {
  accent: AccentId;
  setAccent: (id: AccentId) => void;
  outline: OutlineColour;
  setOutline: (outline: OutlineColour) => void;
  backgroundImage: string | null;
  /** Returns false (and keeps the old value) when the address is not an embedded or local image. */
  setBackgroundImage: (url: string | null) => boolean;
  resetPreferences: () => void;
};

const AppPreferencesContext = createContext<AppPreferencesContextType | undefined>(undefined);

/** Only images that live in the app itself: pasted (data:) images and Tauri's own protocols. */
function isSafeBackdrop(url: string): boolean {
  return url.startsWith("data:image/") || url.startsWith("asset://") || url.startsWith("tauri://");
}

export function AppPreferencesProvider({ children }: { children: React.ReactNode }) {
  const [accent, setAccentState] = useState<AccentId>(readStoredAccent);

  const [backgroundImage, setBackgroundImageState] = useState<string | null>(() => {
    const stored = localStorage.getItem("app_background_image");
    return stored && isSafeBackdrop(stored) ? stored : null;
  });

  useEffect(() => {
    applyAccent(accent);
    storeAccent(accent);
  }, [accent]);

  const [outline, setOutline] = useState<OutlineColour>(readStoredOutline);
  useEffect(() => {
    applyOutline(outline);
    storeOutline(outline);
  }, [outline]);

  useEffect(() => {
    if (backgroundImage) {
      document.body.style.backgroundImage = `url('${backgroundImage}')`;
      document.body.style.backgroundSize = "cover";
      document.body.style.backgroundPosition = "center";
      document.body.style.backgroundAttachment = "fixed";
      document.body.style.backgroundRepeat = "no-repeat";
      localStorage.setItem("app_background_image", backgroundImage);
    } else {
      document.body.style.backgroundImage = "";
      localStorage.removeItem("app_background_image");
    }
  }, [backgroundImage]);

  const setBackgroundImage = (url: string | null) => {
    if (url !== null && !isSafeBackdrop(url)) return false;
    setBackgroundImageState(url);
    return true;
  };

  const resetPreferences = () => {
    setAccentState(DEFAULT_ACCENT);
    setOutline("neutral");
    setBackgroundImageState(null);
  };

  const value = { accent, setAccent: setAccentState, outline, setOutline, backgroundImage, setBackgroundImage, resetPreferences };

  return <AppPreferencesContext.Provider value={value}>{children}</AppPreferencesContext.Provider>;
}

export function useAppPreferences() {
  const context = useContext(AppPreferencesContext);
  if (context === undefined) {
    throw new Error("useAppPreferences must be used within an AppPreferencesProvider");
  }
  return context;
}
