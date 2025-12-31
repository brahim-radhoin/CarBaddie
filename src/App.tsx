import { Navigate, Outlet, Route, Routes } from "react-router-dom";
import { useEffect, useState } from "react";
import { Command } from "@tauri-apps/plugin-shell";
import { resolveResource, appDataDir, join } from "@tauri-apps/api/path";
import { exists, copyFile, mkdir, stat, remove, readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { Layout } from "./components/Layout";
import { AddEditServiceTypePage } from "./pages/AddEditServiceTypePage";
import { AddMaintenanceLogPage } from "./pages/AddMaintenanceLog";
import { AddVehiclePage } from "./pages/AddVehiclePage";
import { EditVehiclePage } from "./pages/EditVehiclePage";
import { ManageServiceTypesPage } from "./pages/ManageServiceTypes";
import { ServiceTypeLogHistoryPage } from "./pages/ServiceTypeLogHistoryPage";
import { VehicleList } from "./pages/VehicleList";
import { VehicleMaintenancePage } from "./pages/VehicleMaintenancePage";
import { VehicleSettingsPage } from "./pages/VehicleSettingsPage";
import { VehicleDetailPage } from "./pages/VehicleDetailPage";
import { SettingsPage } from "./pages/SettingsPage";
import { ShutdownOverlay } from "./components/ShutdownOverlay";
import { StartupScreen } from "./components/StartupScreen";
import { ErrorScreen } from "./components/ErrorScreen";

export default function App() {
  const [backendStatus, setBackendStatus] = useState("starting");
  const [errorMessage, setErrorMessage] = useState("");
  const [backendLogs, setBackendLogs] = useState<string[]>([]);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const [startupProgress, setStartupProgress] = useState(0);

  useEffect(() => {
    const setupBackend = async () => {
      try {
        // Check if backend is already running first
        console.log("Checking if backend is already running...");
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 200); // 200ms timeout

          const testResponse = await fetch("http://127.0.0.1:8000/", {
            signal: controller.signal,
            method: "GET",
          });
          clearTimeout(timeoutId);

          console.log("Backend test response:", testResponse.status);

          // If we got ANY response (200, 404, etc.), backend is running
          if (testResponse.status) {
            console.log("✓ Backend already running, skipping spawn");
            setBackendStatus("running");
            return;
          }
        } catch (err) {
          // Connection refused or timeout = backend not running
          console.log("✗ Backend not responding, spawning new instance", err instanceof Error ? err.message : String(err));
        }

        // 1. Get paths
        const dataDir = await appDataDir();
        const dbFileName = "car_baddie.db";
        const dbPathInDataDir = await join(dataDir, dbFileName);
        const resourcePath = await resolveResource(dbFileName);

        console.log("Data Dir:", dataDir);
        console.log("DB Path in Data Dir:", dbPathInDataDir);
        console.log("Resource Path:", resourcePath);

        // 2. Check if DB exists in data dir, if not, copy it
        const dbExists = await exists(dbPathInDataDir);
        let shouldCopy = !dbExists;

        // Version-based DB update check
        const DB_VERSION = "1"; // Increment when shipping new seed data
        const versionFilePath = await join(dataDir, ".db_version");

        if (dbExists) {
          try {
            const versionFileExists = await exists(versionFilePath);
            const existingVersion = versionFileExists ? (await readTextFile(versionFilePath)).trim() : "0";

            if (existingVersion !== DB_VERSION) {
              console.log(`DB version mismatch (${existingVersion} → ${DB_VERSION}). Backing up and updating...`);
              // Backup existing DB before overwriting
              const backupsDir = await join(dataDir, "backups");
              await mkdir(backupsDir, { recursive: true });
              const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
              const backupPath = await join(backupsDir, `car_baddie_${timestamp}.db`);
              await copyFile(dbPathInDataDir, backupPath);
              console.log(`User DB backed up to: ${backupPath}`);
              shouldCopy = true;
            }
          } catch (err) {
            console.warn("Failed to check DB version:", err);
          }
        }

        if (shouldCopy) {
          // Ensure data directory exists
          const dataDirExists = await exists(dataDir);
          if (dataDirExists) {
            const info = await stat(dataDir);
            if (!info.isDirectory) {
              console.warn("Data directory path exists but is not a directory. Removing file...");
              await remove(dataDir);
            }
          }
          await mkdir(dataDir, { recursive: true });

          // Copy from resources
          await copyFile(resourcePath, dbPathInDataDir);
          console.log("Database copied to data directory.");

          // Write version file
          await writeTextFile(versionFilePath, DB_VERSION);
          console.log(`DB version file written: ${DB_VERSION}`);
        }

        // 3. Spawn sidecar with DB path as argument
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
          setBackendLogs((prev) => [...prev.slice(-49), line]); // Keep last 50 lines
        });

        command.stderr.on("data", (line) => {
          console.log(`[Backend stderr]: ${line}`);
          setBackendLogs((prev) => [...prev.slice(-49), `ERR: ${line}`]);
        });

        const child = await command.spawn();
        console.log("Sidecar spawned with PID:", child.pid);

        // Store PID in Rust backend for cleanup
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

    const waitForBackend = async () => {
      let attempts = 0;
      const maxAttempts = 40; // 20 seconds max
      while (true) {
        try {
          await fetch("http://127.0.0.1:8000/");
          setStartupProgress(100);
          setBackendStatus("running");
          break;
        } catch (error) {
          attempts++;
          // Update progress: 20% base + 80% based on attempts
          const progress = Math.min(20 + (attempts / maxAttempts) * 80, 95);
          setStartupProgress(progress);

          if (attempts % 10 === 0) {
            setBackendLogs((prev) => [...prev, `Waiting for backend... (${attempts * 0.5}s)`]);
          }
          await new Promise((resolve) => setTimeout(resolve, 200));
        }
      }
    };

    // Set initial progress
    setStartupProgress(5);

    setupBackend().then(() => {
      setStartupProgress(20);
      waitForBackend();
    });
  }, []);

  if (backendStatus === "starting") {
    return <StartupScreen backendLogs={backendLogs} progress={startupProgress} />;
  }

  // Don't show error state during intentional shutdown
  if (backendStatus === "error" && !isShuttingDown) {
    return <ErrorScreen errorMessage={errorMessage} backendLogs={backendLogs} />;
  }

  return (
    <>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/vehicles" element={<VehicleList />} />
          <Route path="/vehicles/new" element={<AddVehiclePage />} />
          <Route path="/settings" element={<SettingsPage />} />

          <Route path="/vehicles/:vehicleId" element={<VehicleDetailPage />}>
            <Route index element={<VehicleMaintenancePage />} /> {/* The dashboard is now the "index" */}
            <Route path="settings" element={<VehicleSettingsPage />} />
            <Route path="add-log" element={<AddMaintenanceLogPage />} />
            <Route path="logs/:logId/edit" element={<AddMaintenanceLogPage />} />
            <Route path="history/:serviceTypeId" element={<ServiceTypeLogHistoryPage />} />
          </Route>

          <Route path="/vehicles/:vehicleId/edit" element={<EditVehiclePage />} />
          {/* <Route path="/vehicles/:vehicleId/settings" element={<VehicleSettingsPage />} /> */}
          {/* <Route path="/vehicles/:vehicleId/maintenance" element={<VehicleMaintenancePage />} /> */}
          {/* <Route path="/vehicles/:vehicleId/maintenance/add" element={<AddMaintenanceLogPage />} /> */}
          {/* <Route path="/vehicles/:vehicleId/maintenance/type/:serviceTypeId" element={<ServiceTypeLogHistoryPage />} /> */}
          {/* <Route path="/vehicles/:vehicleId/maintenance/:logId/edit" element={<AddMaintenanceLogPage />} /> */}
          <Route path="/service-types/new" element={<AddEditServiceTypePage />} />
          <Route path="/service-types/manage" element={<ManageServiceTypesPage />} />
          <Route path="/service-types/:serviceTypeId/edit" element={<AddEditServiceTypePage />} />

          <Route path="*" element={<Navigate to="/vehicles" />} />
          <Route path="/" element={<Navigate to="/vehicles" replace />} />
        </Route>
      </Routes>
      <ShutdownOverlay onShutdownStart={() => setIsShuttingDown(true)} />
    </>
  );
}
