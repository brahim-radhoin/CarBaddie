import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";

interface StartupScreenProps {
  backendLogs: string[];
  progress?: number;
}

export function StartupScreen({ backendLogs, progress = 0 }: StartupScreenProps) {
  const [showLogs, setShowLogs] = useState(false);
  const clampedProgress = Math.min(Math.max(progress, 0), 100);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        {/* Brand Mark */}
        <div className="inline-flex items-center justify-center w-14 h-14 rounded-xl border border-border bg-card overflow-hidden mx-auto shadow-sm">
          <img
            src="/carbaddie-logo.png"
            alt="CarBaddie Logo"
            className="w-full h-full object-cover"
          />
        </div>

        <div>
          <h1 className="text-xl font-medium tracking-tight text-foreground">
            CarBaddie
          </h1>
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            Initializing local SQLite telemetry database...
          </p>
        </div>

        {/* Minimal Progress Bar */}
        <div className="space-y-2">
          <div className="h-1.5 w-full bg-secondary rounded-full overflow-hidden border border-border/40">
            <div
              className="h-full bg-foreground transition-all duration-300 ease-out"
              style={{ width: `${clampedProgress}%` }}
            />
          </div>
          <div className="flex justify-between items-center text-[11px] font-mono text-muted-foreground">
            <span>Opening local database</span>
            <span>{Math.round(clampedProgress)}%</span>
          </div>
        </div>

        {/* Diagnostics / Logs Collapsible */}
        <div className="pt-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowLogs(!showLogs)}
            className="text-xs text-muted-foreground hover:text-foreground h-7"
          >
            {showLogs ? (
              <>
                <ChevronUp className="h-3 w-3 mr-1" /> Hide Diagnostics
              </>
            ) : (
              <>
                <ChevronDown className="h-3 w-3 mr-1" /> View Diagnostics ({backendLogs.length})
              </>
            )}
          </Button>

          {showLogs && (
            <div className="mt-3 p-3 bg-card border border-border rounded-lg text-left max-h-48 overflow-y-auto">
              <pre className="font-mono text-[10px] text-muted-foreground space-y-0.5 leading-relaxed whitespace-pre-wrap">
                {backendLogs.length === 0
                  ? "Awaiting daemon logs..."
                  : backendLogs.map((log, index) => <div key={index}>{log}</div>)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
