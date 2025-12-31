import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { invoke } from "@tauri-apps/api/core";

export function ShutdownOverlay({ onShutdownStart }: { onShutdownStart?: () => void }) {
  const [isShuttingDown, setIsShuttingDown] = useState(false);

  useEffect(() => {
    console.log("[ShutdownOverlay] Component mounted, setting up close handler");

    let unlisten: (() => void) | null = null;

    const setupListener = async () => {
      try {
        const appWindow = getCurrentWindow();

        // Register the listener
        unlisten = await appWindow.onCloseRequested(async (event) => {
          console.log("[ShutdownOverlay] ✓ Close event captured!");
          event.preventDefault();

          // Notify parent that shutdown is starting
          if (onShutdownStart) {
            onShutdownStart();
          }

          setIsShuttingDown(true);

          try {
            console.log("[ShutdownOverlay] Calling cleanup_backend...");
            await invoke("cleanup_backend");
            console.log("[ShutdownOverlay] ✓ Backend cleanup complete");
          } catch (error) {
            console.error("[ShutdownOverlay] ✗ Cleanup failed:", error);
          }

          // Brief delay for animation
          await new Promise((resolve) => setTimeout(resolve, 100));

          console.log("[ShutdownOverlay] Destroying window...");
          await appWindow.destroy();
        });

        console.log("[ShutdownOverlay] ✓ Close handler registered successfully");
      } catch (error) {
        console.error("[ShutdownOverlay] ✗ Failed to register close handler:", error);
      }
    };

    setupListener();

    return () => {
      console.log("[ShutdownOverlay] Cleaning up listener");
      if (unlisten) {
        unlisten();
      }
    };
  }, []);

  if (!isShuttingDown) return null;

  return (
    <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4 p-8 rounded-lg border bg-card shadow-lg">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <div className="text-center">
          <h2 className="text-xl font-semibold mb-1">Shutting down...</h2>
          <p className="text-sm text-muted-foreground">Cleaning up background processes</p>
        </div>
      </div>
    </div>
  );
}
