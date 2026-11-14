import { useEffect } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { performAutoSync, setRemoteChangesListener } from "../services/googleDrive";

/** Syncs at start and whenever the app returns to the foreground; refreshes queries when data changed. */
export function useAutoSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    setRemoteChangesListener(() => void queryClient.invalidateQueries());
    void performAutoSync();

    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") void performAutoSync();
    };
    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => {
      sub.remove();
      setRemoteChangesListener(null);
    };
  }, [queryClient]);
}
