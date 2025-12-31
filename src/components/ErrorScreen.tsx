import { Car, AlertCircle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorScreenProps {
  errorMessage: string;
  backendLogs: string[];
  onRetry?: () => void;
}

export function ErrorScreen({ errorMessage, backendLogs, onRetry }: ErrorScreenProps) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-destructive/5 flex items-center justify-center p-8">
      <div className="w-full max-w-2xl">
        {/* Main Card */}
        <div className="bg-card border border-destructive/50 rounded-lg shadow-2xl p-8 space-y-6">
          {/* Header with Error Icon */}
          <div className="text-center space-y-3">
            <div className="flex items-center justify-center">
              <div className="relative">
                <Car className="h-16 w-16 text-muted-foreground/50" />
                <AlertCircle className="h-8 w-8 text-destructive absolute -top-2 -right-2 animate-pulse" />
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-bold tracking-tight text-destructive">Failed to Start Backend</h1>
              <p className="text-muted-foreground mt-2">The backend server encountered an error during startup</p>
            </div>
          </div>

          {/* Error Message */}
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4">
            <h3 className="font-semibold text-sm text-destructive mb-2">Error Details</h3>
            <pre className="text-xs overflow-auto max-h-24 text-foreground/90 font-mono bg-background/50 p-3 rounded">{errorMessage}</pre>
          </div>

          {/* Backend Logs - Always visible on error */}
          <div className="space-y-2">
            <h3 className="font-semibold text-sm flex items-center gap-2">
              Backend Logs
              <span className="text-xs text-muted-foreground font-normal">({backendLogs.length} entries)</span>
            </h3>
            <div className="bg-gray-950 text-green-400 p-4 rounded-lg h-64 overflow-auto font-mono text-xs border border-destructive/20">
              {backendLogs.length > 0 ? (
                backendLogs.map((log, i) => (
                  <div key={i} className="py-0.5">
                    <span className="text-green-600 mr-2">[{i + 1}]</span>
                    {log}
                  </div>
                ))
              ) : (
                <div className="text-muted-foreground italic">No logs captured</div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="space-y-3">
            {onRetry && (
              <Button onClick={onRetry} className="w-full" size="lg">
                <RefreshCw className="mr-2 h-4 w-4" />
                Retry Startup
              </Button>
            )}
            <p className="text-center text-sm text-muted-foreground">
              Try restarting the application or check the logs above for more details.
            </p>
          </div>

          {/* Help Text */}
          <div className="border-t pt-4 space-y-2">
            <h4 className="text-sm font-semibold">Troubleshooting Tips:</h4>
            <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
              <li>Check if another instance of CarBaddie is already running</li>
              <li>Ensure port 8000 is not being used by another application</li>
              <li>Verify the database file is not corrupted</li>
              <li>Review the backend logs above for specific error messages</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
