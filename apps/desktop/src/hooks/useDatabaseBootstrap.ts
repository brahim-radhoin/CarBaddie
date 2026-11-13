import { useEffect, useState } from "react";
import { openDatabase } from "../db";

/** Opens (and if needed migrates) the local database before the app renders. */
export function useDatabaseBootstrap() {
  const [status, setStatus] = useState<"starting" | "running" | "error">("starting");
  const [errorMessage, setErrorMessage] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    openDatabase()
      .then(({ path, backupPath, migrated }) => {
        if (cancelled) return;
        const lines = [`Database: ${path}`];
        if (migrated.from !== migrated.to) lines.push(`Upgraded schema v${migrated.from} → v${migrated.to}`);
        if (backupPath) lines.push(`Previous database saved to ${backupPath}`);
        lines.forEach((line) => console.info(line));
        setLogs(lines);
        setStatus("running");
      })
      .catch((error) => {
        if (cancelled) return;
        const message = error instanceof Error ? error.message : String(error);
        console.error("Failed to open the database:", error);
        setErrorMessage(message);
        setLogs((prev) => [...prev, `ERR: ${message}`]);
        setStatus("error");
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const retry = () => {
    setStatus("starting");
    setErrorMessage("");
    setAttempt((n) => n + 1);
  };

  return { status, errorMessage, logs, retry };
}
