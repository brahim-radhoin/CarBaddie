import { Navigate, Route, Routes } from "react-router-dom";
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
import { StartupScreen } from "./components/StartupScreen";
import { ErrorScreen } from "./components/ErrorScreen";
import { useDatabaseBootstrap } from "./hooks/useDatabaseBootstrap";

export default function App() {
  const { status, errorMessage, logs, retry } = useDatabaseBootstrap();

  if (status === "starting") {
    return <StartupScreen backendLogs={logs} progress={50} />;
  }

  if (status === "error") {
    return <ErrorScreen errorMessage={errorMessage} backendLogs={logs} onRetry={retry} />;
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
          <Route path="/service-types" element={<ManageServiceTypesPage />} />
          <Route path="/service-types/manage" element={<ManageServiceTypesPage />} />
          <Route path="/service-types/new" element={<AddEditServiceTypePage />} />
          <Route path="/service-types/:serviceTypeId/edit" element={<AddEditServiceTypePage />} />

          <Route path="*" element={<Navigate to="/vehicles" />} />
          <Route path="/" element={<Navigate to="/vehicles" replace />} />
        </Route>
      </Routes>
    </>
  );
}
