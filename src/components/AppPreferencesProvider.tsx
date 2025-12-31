import React, { createContext, useContext, useEffect, useState } from "react";
import { toast } from "sonner"; // Optional, for notifications if needed

type AppPreferencesContextType = {
  primaryColor: string;
  setPrimaryColor: (color: string) => void;
  accentColor: string;
  setAccentColor: (color: string) => void;
  backgroundImage: string | null;
  setBackgroundImage: (url: string | null) => void;
  resetPreferences: () => void;
};

const AppPreferencesContext = createContext<AppPreferencesContextType | undefined>(undefined);

const DEFAULT_PRIMARY = "oklch(0.45 0.15 265)"; // Indigo
const DEFAULT_ACCENT = "oklch(0.93 0.08 150)"; // Green

// Helper to validate color string (basic check)
const isValidColor = (color: string) => {
  // Very basic check, mainly to prevent completely broken CSS
  return color.startsWith("#") || color.startsWith("rgb") || color.startsWith("hsl") || color.startsWith("oklch");
};

// Helper to determine foreground color (black or white) based on background lightness
const getReviewForeground = (color: string) => {
  let lightness = 0.5;

  // Try parsing OKLCH
  if (color.startsWith("oklch(")) {
    // Expected format: oklch(L C H) or oklch(L C H / A)
    // We want the first number.
    const match = color.match(/oklch\(\s*([0-9.]+)/);
    if (match && match[1]) {
      lightness = parseFloat(match[1]);
    }
  }
  // Very basic Hex support
  else if (color.startsWith("#")) {
    const hex = color.replace("#", "");
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);
    // perceived lightness approximation
    lightness = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  // Threshold: if lightness > 0.55, use pure black. Else pure white.
  return lightness > 0.55 ? "oklch(0 0 0)" : "oklch(1 0 0)";
};

export function AppPreferencesProvider({ children }: { children: React.ReactNode }) {
  // --- State ---
  const [primaryColor, setPrimaryColor] = useState<string>(() => {
    return localStorage.getItem("app_primary_color") || DEFAULT_PRIMARY;
  });

  const [accentColor, setAccentColor] = useState<string>(() => {
    return localStorage.getItem("app_accent_color") || DEFAULT_ACCENT;
  });

  const [backgroundImage, setBackgroundImage] = useState<string | null>(() => {
    return localStorage.getItem("app_background_image") || null;
  });

  // --- Effects to Update CSS Variables ---

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--primary", primaryColor);

    // Calculate readable foreground
    const fg = getReviewForeground(primaryColor);
    root.style.setProperty("--primary-foreground", fg);

    // We might also want to update ring color to match
    root.style.setProperty("--ring", primaryColor.replace(")", " / 0.8)"));

    localStorage.setItem("app_primary_color", primaryColor);
  }, [primaryColor]);

  useEffect(() => {
    const root = document.documentElement;
    root.style.setProperty("--accent", accentColor);

    // Calculate readable foreground for highlights
    const fg = getReviewForeground(accentColor);
    root.style.setProperty("--accent-foreground", fg);

    localStorage.setItem("app_accent_color", accentColor);
  }, [accentColor]);

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

  // --- Actions ---

  const resetPreferences = () => {
    setPrimaryColor(DEFAULT_PRIMARY);
    setAccentColor(DEFAULT_ACCENT);
    setBackgroundImage(null);
    toast.success("Theme preferences reset to default.");
  };

  const value = {
    primaryColor,
    setPrimaryColor,
    accentColor,
    setAccentColor,
    backgroundImage,
    setBackgroundImage,
    resetPreferences,
  };

  return <AppPreferencesContext.Provider value={value}>{children}</AppPreferencesContext.Provider>;
}

export function useAppPreferences() {
  const context = useContext(AppPreferencesContext);
  if (context === undefined) {
    throw new Error("useAppPreferences must be used within an AppPreferencesProvider");
  }
  return context;
}
