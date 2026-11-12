import { useEffect, useState } from "react";
import { Command } from "@tauri-apps/plugin-shell";
import { resolveResource, appDataDir, join } from "@tauri-apps/api/path";
import { exists, copyFile, mkdir, stat, remove } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";

export function useBackendBootstrap() {
  const [backendStatus, setBackendStatus] = useState<"starting" | "running" | "error">("starting");
  const [errorMessage, setErrorMessage] = useState("");
  const [backendLogs, setBackendLogs] = useState<string[]>([]);
  const [startupProgress, setStartupProgress] = useState(0);
  const [retryCounter, setRetryCounter] = useState(0);

  const retry = () => {
    setBackendStatus("starting");
    setErrorMessage("");
    setBackendLogs((prev) => [...prev, "Retrying backend startup..."]);
    setStartupProgress(5);
    setRetryCounter((c) => c + 1);
  };

  useEffect(() => {
    const controller = new AbortController();

    const setupBackend = async () => {
      try {
        console.log("Checking if backend is already running...");
        try {
          const pingController = new AbortController();
          const timeoutId = setTimeout(() => pingController.abort(), 200);
          const testResponse = await fetch("http://127.0.0.1:8000/", {
            signal: pingController.signal,
            method: "GET",
          });
          clearTimeout(timeoutId);

          if (testResponse.status) {
            console.log("✓ Backend already running, skipping spawn");
            setBackendStatus("running");
            return;
          }
        } catch (err) {
          console.log("✗ Backend not responding, spawning new instance", err instanceof Error ? err.message : String(err));
        }

        const dataDir = await appDataDir();
        const dbFileName = "car_baddie.db";
        const dbPathInDataDir = await join(dataDir, dbFileName);
        const resourcePath = await resolveResource(dbFileName);

        const dbExists = await exists(dbPathInDataDir);
        if (!dbExists) {
          console.log("DB does not exist. Performing initial seed data copy...");
          
          const dataDirExists = await exists(dataDir);
          if (dataDirExists) {
            const info = await stat(dataDir);
            if (!info.isDirectory) {
              console.warn("Data directory path exists but is not a directory. Removing file...");
              await remove(dataDir);
            }
          }
          await mkdir(dataDir, { recursive: true });
          
          await copyFile(resourcePath, dbPathInDataDir);
          console.log("Database copied to data directory.");
        }

        const command = Command.sidecar("carbaddie-backend", ["--database-path", dbPathInDataDir]);

        command.on("close", (data) => {
          console.log(`command finished with code ${data.code} and signal ${data.signal}`);
          const msg = `Backend process exited with code ${data.code}`;
          setBackendLogs((prev) => [...prev, msg]);
          if (data.code !== 0) {
            setErrorMessage(msg);
            setBackendStatus("error");
          }
        });

        command.on("error", (error) => {
          const msg = `Command error: "${error}"`;
          console.error(msg);
          setBackendLogs((prev) => [...prev, msg]);
          setErrorMessage(msg);
          setBackendStatus("error");
        });

        command.stdout.on("data", (line) => {
          console.log(`[Backend stdout]: ${line}`);
          setBackendLogs((prev) => [...prev.slice(-49), line]);
        });

        command.stderr.on("data", (line) => {
          console.log(`[Backend stderr]: ${line}`);
          setBackendLogs((prev) => [...prev.slice(-49), `ERR: ${line}`]);
        });

        const child = await command.spawn();
        console.log("Sidecar spawned with PID:", child.pid);

        try {
          await invoke("store_backend_pid", { pid: child.pid });
          console.log("Backend PID stored for cleanup");
        } catch (error) {
          console.warn("Failed to store backend PID:", error);
        }
      } catch (error) {
        console.error("Failed to setup or spawn sidecar:", error);
        setErrorMessage(error instanceof Error ? error.message : String(error));
        setBackendStatus("error");
      }
    };

    const waitForBackend = async (signal: AbortSignal) => {
      let attempts = 0;
      const maxAttempts = 120; // 60 seconds total to allow PyInstaller unpacked startup
      while (attempts < maxAttempts) {
        if (signal.aborted) return;
        try {
          await fetch("http://127.0.0.1:8000/", { signal });
          setStartupProgress(100);
          setBackendStatus("running");
          return;
        } catch {
          attempts++;
          const progress = Math.min(20 + (attempts / maxAttempts) * 80, 95);
          setStartupProgress(progress);

          if (attempts % 4 === 0) {
            setBackendLogs((prev) => [...prev, `Waiting for backend... (${Math.round(attempts * 0.5)}s)`]);
          }
          await new Promise((resolve) => setTimeout(resolve, 500));
        }
      }
      setErrorMessage("Backend did not start within the allowed time (60s). Click Retry to try again.");
      setBackendStatus("error");
    };

    setStartupProgress(5);
    setupBackend().then(() => {
      setStartupProgress(20);
      waitForBackend(controller.signal);
    });

    return () => controller.abort();
  }, [retryCounter]);

  return { backendStatus, errorMessage, backendLogs, startupProgress, retry };
}
