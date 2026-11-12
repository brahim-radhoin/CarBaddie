import { useEffect } from "react";
import { AppState, AppStateStatus } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { performAutoSync } from "../services/googleDrive";

export function useAutoSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // 1. Initial check on mount
    performAutoSync(() => {
      queryClient.invalidateQueries();
    });

    // 2. Check whenever user returns to the app from background
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === "active") {
        performAutoSync(() => {
          queryClient.invalidateQueries();
        });
      }
    };

    const sub = AppState.addEventListener("change", handleAppStateChange);
    return () => sub.remove();
  }, [queryClient]);
}

