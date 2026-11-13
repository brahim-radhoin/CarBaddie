import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getGoogleDriveStatus, NotConnectedError } from "../services/googleDrive";
import { syncNow } from "../services/sync";

const PERIOD_MS = 5 * 60_000;
const AFTER_EDIT_MS = 3_000;
const AFTER_FOCUS_MS = 500;

/**
 * Background sync while connected and "Automatic Background Sync" is on: at start, every few
 * minutes, when the window regains focus, and shortly after any successful edit.
 */
export function useAutoSync(enabled: boolean) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      const status = await getGoogleDriveStatus();
      if (!status.isConnected || !status.autoSyncEnabled) return;
      try {
        const result = await syncNow();
        if (result.applied > 0) await queryClient.invalidateQueries();
      } catch (error) {
        if (!(error instanceof NotConnectedError)) console.warn("Background sync failed:", error);
      }
    };
    const schedule = (ms: number) => {
      clearTimeout(timer);
      timer = setTimeout(run, ms);
    };

    schedule(0);
    const interval = setInterval(run, PERIOD_MS);
    const onFocus = () => schedule(AFTER_FOCUS_MS);
    window.addEventListener("focus", onFocus);
    const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
      if (event.type === "updated" && event.mutation.state.status === "success") schedule(AFTER_EDIT_MS);
    });

    return () => {
      clearTimeout(timer);
      clearInterval(interval);
      window.removeEventListener("focus", onFocus);
      unsubscribe();
    };
  }, [enabled, queryClient]);
}
