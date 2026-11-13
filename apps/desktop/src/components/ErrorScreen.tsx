import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorScreenProps {
  errorMessage: string;
  backendLogs: string[];
  onRetry?: () => void;
}

export function ErrorScreen({ errorMessage, backendLogs, onRetry }: ErrorScreenProps) {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-5">
        <div className="flex items-center gap-3 pb-3 border-b border-border">
          <div className="w-8 h-8 rounded border border-destructive/30 bg-destructive/10 flex items-center justify-center text-destructive flex-shrink-0">
            <AlertTriangle className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-base font-medium text-foreground">
              Database Error
            </h1>
            <p className="text-xs text-muted-foreground">
              The local database could not be opened or upgraded. Your data was not changed.
            </p>
          </div>
        </div>

        {/* Error Details */}
        <div className="rounded border border-destructive/30 bg-destructive/5 p-3">
          <pre className="text-xs font-mono text-destructive whitespace-pre-wrap leading-relaxed">
            {errorMessage}
          </pre>
        </div>

        {/* Console Logs */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">
            Startup Telemetry Log ({backendLogs.length} entries)
          </span>
          <div className="bg-card border border-border p-3 rounded text-xs font-mono max-h-56 overflow-y-auto space-y-1">
            {backendLogs.length > 0 ? (
              backendLogs.map((log, i) => (
                <div key={i} className="text-muted-foreground text-[11px] leading-relaxed">
                  <span className="opacity-40 select-none mr-2">[{i + 1}]</span>
                  {log}
                </div>
              ))
            ) : (
              <div className="text-muted-foreground italic">No logs captured.</div>
            )}
          </div>
        </div>

        {onRetry && (
          <div className="flex justify-end pt-2">
            <Button onClick={onRetry} size="sm" className="h-8 text-xs gap-1.5">
              <RefreshCw className="h-3 w-3" /> Retry Launch
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
