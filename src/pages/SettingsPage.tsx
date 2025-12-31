import React, { useState } from "react";
import { useAppPreferences } from "../components/AppPreferencesProvider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Paintbrush, RotateCcw } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const THEME_PRESETS = [
  { name: "Default (Indigo)", primary: "oklch(0.45 0.15 265)", accent: "oklch(0.93 0.08 150)" },
  { name: "Ocean", primary: "oklch(0.45 0.15 240)", accent: "oklch(0.85 0.1 200)" },
  { name: "Forest", primary: "oklch(0.45 0.14 150)", accent: "oklch(0.92 0.12 95)" },
  { name: "Sunset", primary: "oklch(0.55 0.2 30)", accent: "oklch(0.88 0.15 80)" },
  { name: "Berry", primary: "oklch(0.5 0.22 330)", accent: "oklch(0.9 0.1 300)" },
  { name: "Slate", primary: "oklch(0.4 0.05 260)", accent: "oklch(0.9 0.02 260)" },
];

export function SettingsPage() {
  const { primaryColor, setPrimaryColor, accentColor, setAccentColor, backgroundImage, setBackgroundImage, resetPreferences } =
    useAppPreferences();

  const { theme, setTheme } = useTheme();

  // Local state for image input to avoid jerky updates
  const [imageUrl, setImageUrl] = useState(backgroundImage || "");

  const handleImageSave = () => {
    setBackgroundImage(imageUrl.trim() || null);
  };

  const handleImageClear = () => {
    setImageUrl("");
    setBackgroundImage(null);
  };

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="text-muted-foreground">Manage your application preferences and appearance.</p>
      </div>

      <Separator />

      <section className="space-y-6">
        <div>
          <h2 className="text-lg font-medium flex items-center gap-2">
            <Paintbrush className="h-5 w-5" />
            Appearance
          </h2>
          <p className="text-sm text-muted-foreground">Customize how CarBaddie looks.</p>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Theme Mode */}
          <Card>
            <CardHeader>
              <CardTitle>Theme Mode</CardTitle>
              <CardDescription>Select your preferred theme mode.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  variant={theme === "light" ? "default" : "outline"}
                  onClick={() => setTheme("light")}
                  className={cn(
                    "w-24",
                    theme === "light" && "ring-2 ring-primary ring-offset-2 font-bold",
                    theme !== "light" && "hover:bg-secondary hover:text-secondary-foreground"
                  )}
                >
                  Light
                </Button>
                <Button
                  variant={theme === "dark" ? "default" : "outline"}
                  onClick={() => setTheme("dark")}
                  className={cn(
                    "w-24",
                    theme === "dark" && "ring-2 ring-primary ring-offset-2 font-bold",
                    theme !== "dark" && "hover:bg-secondary hover:text-secondary-foreground"
                  )}
                >
                  Dark
                </Button>
                <Button
                  variant={theme === "system" ? "default" : "outline"}
                  onClick={() => setTheme("system")}
                  className={cn(
                    "w-24",
                    theme === "system" && "ring-2 ring-primary ring-offset-2 font-bold",
                    theme !== "system" && "hover:bg-secondary hover:text-secondary-foreground"
                  )}
                >
                  System
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Colors */}
          <Card>
            <CardHeader>
              <CardTitle>Color Theme</CardTitle>
              <CardDescription>Choose a preset theme or customize colors.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Presets Grid */}
              <div>
                <Label className="text-base mb-3 block">Presets</Label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {THEME_PRESETS.map((preset) => {
                    const isActive = preset.primary === primaryColor && preset.accent === accentColor;
                    return (
                      <button
                        key={preset.name}
                        onClick={() => {
                          setPrimaryColor(preset.primary);
                          setAccentColor(preset.accent);
                        }}
                        className={cn(
                          "group flex flex-col gap-2 p-2 rounded-lg border transition-all text-left",
                          isActive
                            ? "ring-2 ring-primary ring-offset-2 border-primary bg-accent/10"
                            : "hover:bg-secondary hover:border-secondary-foreground/20"
                        )}
                      >
                        <div className="flex w-full h-12 rounded-md overflow-hidden border shadow-sm">
                          <div className="h-full w-2/3" style={{ background: preset.primary }} />
                          <div className="h-full w-1/3" style={{ background: preset.accent }} />
                        </div>
                        <span className={cn("text-sm", isActive && "font-bold")}>{preset.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <Separator />

              {/* Advanced Customization */}
              <div className="space-y-4">
                <Label className="text-base">Custom Colors</Label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="primary-color" className="text-xs text-muted-foreground">
                      Primary Color
                    </Label>
                    <div className="flex gap-2">
                      <div className="h-10 w-10 shrink-0 rounded-md border shadow-sm" style={{ backgroundColor: primaryColor }} />
                      <Input
                        id="primary-color"
                        value={primaryColor}
                        onChange={(e) => setPrimaryColor(e.target.value)}
                        placeholder="oklch(...)"
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>

                  <div className="grid gap-2">
                    <Label htmlFor="accent-color" className="text-xs text-muted-foreground">
                      Accent Color
                    </Label>
                    <div className="flex gap-2">
                      <div className="h-10 w-10 shrink-0 rounded-md border shadow-sm" style={{ backgroundColor: accentColor }} />
                      <Input
                        id="accent-color"
                        value={accentColor}
                        onChange={(e) => setAccentColor(e.target.value)}
                        placeholder="oklch(...)"
                        className="font-mono text-xs"
                      />
                    </div>
                  </div>
                </div>
                <p className="text-[10px] text-muted-foreground">Accepts CSS color values (hex, rgb, oklch, hsl).</p>
              </div>
            </CardContent>
          </Card>

          {/* Background Image */}
          <Card className="md:col-span-2">
            <CardHeader>
              <CardTitle>Background Image</CardTitle>
              <CardDescription>Set a custom background image URL.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-2">
                <Input placeholder="https://example.com/image.jpg" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
                <Button onClick={handleImageSave}>Save</Button>
                {backgroundImage && (
                  <Button variant="outline" onClick={handleImageClear} className="hover:bg-secondary hover:text-secondary-foreground">
                    Clear
                  </Button>
                )}
              </div>
              {backgroundImage && (
                <div className="relative aspect-video w-full max-w-md overflow-hidden rounded-lg border bg-muted">
                  <img src={backgroundImage} alt="Background preview" className="h-full w-full object-cover" />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40 text-white font-medium">Preview</div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Reset Actions */}
        <div className="flex justify-end">
          <Button variant="destructive" onClick={resetPreferences}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset to Defaults
          </Button>
        </div>
      </section>
    </div>
  );
}
