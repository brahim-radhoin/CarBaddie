import { useState } from "react";
import { ChevronDown, ChevronUp, Car, Gauge, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StartupScreenProps {
  backendLogs: string[];
  progress?: number; // 0-100
}

export function StartupScreen({ backendLogs, progress = 0 }: StartupScreenProps) {
  const [showLogs, setShowLogs] = useState(false);

  // Calculate car position based on progress (0-100)
  const carPosition = Math.min(progress, 100);

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-primary/5 flex items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        {/* Main Card */}
        <div className="bg-card border rounded-lg shadow-2xl p-8 space-y-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <div className="flex items-center justify-center gap-3 mb-4">
              <Car className="h-10 w-10 text-primary" />
              <h1 className="text-4xl font-bold tracking-tight">CarBaddie</h1>
            </div>
            <p className="text-muted-foreground text-lg">Starting your maintenance companion...</p>
          </div>

          {/* Animation Area */}
          <div className="relative h-32 bg-secondary/20 rounded-lg overflow-hidden">
            {/* Road/Track */}
            <div className="absolute bottom-8 left-0 right-0 h-1 bg-border">
              {/* Road lines */}
              <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-px bg-muted-foreground/30 flex gap-4">
                {[...Array(20)].map((_, i) => (
                  <div key={i} className="h-px w-8 bg-muted-foreground/30" />
                ))}
              </div>
            </div>

            {/* Fuel Pump / Charging Station on the right */}
            <div className="absolute right-8 bottom-4 text-primary/60">
              <Wrench className="h-16 w-16" />
            </div>

            {/* Car moving across */}
            <div className="absolute bottom-6 transition-all duration-500 ease-out" style={{ left: `${carPosition * 0.7}%` }}>
              <Car className="h-12 w-12 text-primary drop-shadow-lg animate-bounce" style={{ animationDuration: "2s" }} />
            </div>

            {/* Speed indicator */}
            <div className="absolute top-4 left-4 flex items-center gap-2 text-sm text-muted-foreground">
              <Gauge className="h-4 w-4" />
              <span className="font-mono">{Math.round(carPosition)}%</span>
            </div>
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="h-3 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500 ease-out rounded-full relative overflow-hidden"
                style={{ width: `${carPosition}%` }}
              >
                {/* Shimmer effect */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
              </div>
            </div>
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Initializing backend...</span>
              <span className="font-mono">{Math.round(carPosition)}%</span>
            </div>
          </div>

          {/* Logs Toggle */}
          <div className="space-y-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowLogs(!showLogs)}
              className="w-full justify-between text-muted-foreground hover:text-foreground"
            >
              <span className="text-xs">Backend Logs {backendLogs.length > 0 && `(${backendLogs.length})`}</span>
              {showLogs ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>

            {showLogs && (
              <div className="bg-gray-950 text-green-400 p-4 rounded-lg h-64 overflow-auto font-mono text-xs border border-primary/20 animate-in slide-in-from-top-2">
                {backendLogs.length > 0 ? (
                  backendLogs.map((log, i) => (
                    <div key={i} className="py-0.5">
                      <span className="text-green-600 mr-2">[{i + 1}]</span>
                      {log}
                    </div>
                  ))
                ) : (
                  <div className="text-muted-foreground italic">No logs yet...</div>
                )}
              </div>
            )}
          </div>

          {/* Status Messages */}
          <div className="text-center space-y-1">
            <div className="flex items-center justify-center gap-2">
              <div className="h-2 w-2 rounded-full bg-primary animate-pulse" />
              <span className="text-sm text-muted-foreground">
                {carPosition < 30 && "Spawning backend process..."}
                {carPosition >= 30 && carPosition < 60 && "Initializing database connection..."}
                {carPosition >= 60 && carPosition < 90 && "Loading server modules..."}
                {carPosition >= 90 && "Almost ready..."}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Shimmer animation CSS */}
      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
      `}</style>
    </div>
  );
}
