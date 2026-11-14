import { useEffect } from "react";
import { AppState } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { addSyncListener } from "../services/googleDrive";
import { checkRemindersNow } from "../services/reminders";

const AFTER_EDIT_MS = 2_000;

/**
 * Reminder checks: at start, when the app returns to the foreground, after a sync that changed
 * data and shortly after an edit (so a logged service drops its pending due-date notification).
 */
export function useReminders() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = () => void checkRemindersNow().catch((e) => console.warn("Reminder check failed:", e));

    run();
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") run();
    });
    const removeSyncListener = addSyncListener((result) => {
      if (result.applied > 0) run();
    });
    const unsubscribe = queryClient.getMutationCache().subscribe((event) => {
      if (event.type !== "updated" || event.mutation.state.status !== "success") return;
      clearTimeout(timer);
      timer = setTimeout(run, AFTER_EDIT_MS);
    });

    return () => {
      clearTimeout(timer);
      sub.remove();
      removeSyncListener();
      unsubscribe();
    };
  }, [queryClient]);
}
