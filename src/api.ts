import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import axios, { AxiosError } from "axios";
import { toast } from "sonner"; // Import toast
import {
  VehicleRead,
  VehicleCreate,
  VehicleUpdate,
  VehicleServiceIntervalOverrideCreate,
  VehicleServiceIntervalOverrideRead,
  BackupConfiguration,
  FullBackupData,
  BackupAnalysisResponse,
  RestorePlan,
  ServiceTypeRead,
  ServiceTypeCreate,
  ServiceTypeUpdate,
  ServiceTypeLogSummary,
  MaintenanceLogRead,
  MaintenanceLogCreate,
  MaintenanceLogUpdate,
  CustomFieldRead,
} from "./types";

const API_BASE_URL = "http://localhost:8000";

// --- VEHICLE HOOKS ---

// For fetching the list of all vehicles
export function useVehicles() {
  return useQuery<VehicleRead[]>({
    // Add explicit type for clarity
    queryKey: ["vehicles"],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/vehicles/`);
      return data;
    },
  });
}

// For fetching a single vehicle by ID
export const useVehicle = (vehicleId?: string) => {
  return useQuery<VehicleRead>({
    queryKey: ["vehicles", vehicleId],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/vehicles/${vehicleId}`);
      return data;
    },
    enabled: !!vehicleId, // Only run if vehicleId is present
  });
};

// For creating a new vehicle
export function useAddVehicle() {
  const queryClient = useQueryClient();
  return useMutation<VehicleRead, AxiosError<{ detail: any }>, VehicleCreate>({
    mutationFn: async (vehicle) => {
      const { data } = await axios.post(`${API_BASE_URL}/vehicles/`, vehicle);
      return data;
    },
    onSuccess: (newVehicle) => {
      toast.success(`Vehicle "${newVehicle.make} ${newVehicle.model}" added successfully!`);
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: (error) => {
      const errorMsg = error.response?.data?.detail?.[0]?.msg || error.response?.data?.detail || "Failed to add vehicle.";
      toast.error(errorMsg);
    },
  });
}

interface UpdateVehicleVariables {
  id: number;
  vehicleData: VehicleUpdate;
}

// For updating an existing vehicle
export function useUpdateVehicle() {
  const queryClient = useQueryClient();
  return useMutation<VehicleRead, AxiosError<{ detail: any }>, UpdateVehicleVariables>({
    mutationFn: async ({ id, vehicleData }) => {
      const { data } = await axios.put(`${API_BASE_URL}/vehicles/${id}`, vehicleData);
      return data;
    },
    onSuccess: (updatedVehicle) => {
      toast.success(`Vehicle "${updatedVehicle.make} ${updatedVehicle.model}" updated.`);
      // Invalidate the main list
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
      // And immediately update the cache for the single vehicle query
      queryClient.setQueryData(["vehicles", updatedVehicle.id.toString()], updatedVehicle);
    },
    onError: (error) => {
      const errorMsg = error.response?.data?.detail?.[0]?.msg || error.response?.data?.detail || "Failed to update vehicle.";
      toast.error(errorMsg);
    },
  });
}

// For deleting a vehicle
export function useDeleteVehicle() {
  const queryClient = useQueryClient();
  return useMutation<void, AxiosError, number>({
    mutationFn: async (vehicleId) => {
      await axios.delete(`${API_BASE_URL}/vehicles/${vehicleId}`);
    },
    onSuccess: () => {
      toast.success("Vehicle deleted successfully.");
      queryClient.invalidateQueries({ queryKey: ["vehicles"] });
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to delete vehicle.");
    },
  });
}

// ====================================================================
//  Backup and Restore Hooks
// ====================================================================

export function useExportBackup() {
  return useMutation<Blob, AxiosError, BackupConfiguration>({
    // Returns a Blob
    mutationFn: async (config) => {
      const response = await axios.post(`${API_BASE_URL}/backup/export`, config, {
        responseType: "blob",
      });
      return response.data;
    },
    // No onSuccess invalidation needed as this is a read-only operation
  });
}

// --- ANALYZE ---
export function useAnalyzeBackup() {
  return useMutation<BackupAnalysisResponse, AxiosError, FormData>({
    // Takes FormData
    mutationFn: async (formData) => {
      const response = await axios.post(`${API_BASE_URL}/backup/analyze`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      return response.data;
    },
  });
}

// --- RESTORE ---
interface RestorePayload {
  plan: RestorePlan;
  backup_data: FullBackupData;
}

export function useRestoreBackup() {
  const queryClient = useQueryClient();
  return useMutation<void, AxiosError, RestorePayload>({
    mutationFn: async (payload) => {
      await axios.post(`${API_BASE_URL}/backup/execute_import`, payload);
    },
    onSuccess: () => {
      // The most robust way to handle a full restore is to invalidate EVERYTHING.
      // The user expects a fresh state after this completes.
      queryClient.invalidateQueries();
    },
  });
}

interface UpsertOverrideVariables {
  vehicleId: number;
  serviceTypeId: number;
  overrideData: VehicleServiceIntervalOverrideCreate;
}

export function useUpsertIntervalOverride() {
  const queryClient = useQueryClient();
  return useMutation<VehicleServiceIntervalOverrideRead, AxiosError<{ detail: string }>, UpsertOverrideVariables>({
    mutationFn: async ({ vehicleId, serviceTypeId, overrideData }) => {
      const { data } = await axios.put(`${API_BASE_URL}/vehicles/${vehicleId}/interval_overrides/${serviceTypeId}`, overrideData);
      return data;
    },
    onSuccess: (_, { vehicleId }) => {
      toast.success("Interval override saved successfully.");
      // Invalidate the specific vehicle's data to trigger a re-fetch of its overrides
      queryClient.invalidateQueries({ queryKey: ["vehicles", vehicleId.toString()] });
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to save override.");
    },
  });
}

interface DeleteOverrideVariables {
  vehicleId: number;
  serviceTypeId: number;
}

export function useDeleteIntervalOverride() {
  const queryClient = useQueryClient();
  return useMutation<void, AxiosError<{ detail: string }>, DeleteOverrideVariables>({
    mutationFn: async ({ vehicleId, serviceTypeId }) => {
      await axios.delete(`${API_BASE_URL}/vehicles/${vehicleId}/interval_overrides/${serviceTypeId}`);
    },
    onSuccess: (_, { vehicleId }) => {
      toast.success("Interval override cleared.");
      queryClient.invalidateQueries({ queryKey: ["vehicles", vehicleId.toString()] });
    },
    onError: (error) => {
      // It's common for a 404 to not be a true "error" in this context, but a state check.
      if (error.response?.status === 404) {
        toast.info("No override was set for this service to clear.");
      } else {
        toast.error(error.response?.data?.detail || "Failed to clear override.");
      }
    },
  });
}

// --- SERVICE TYPE HOOKS ---

// Hook for fetching a single service type
export const useServiceType = (serviceTypeId?: string) => {
  return useQuery<ServiceTypeRead, AxiosError<{ detail: string }>>({
    queryKey: ["service_types", serviceTypeId],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/service_types/${serviceTypeId}`);
      return data;
    },
    enabled: !!serviceTypeId, // Only run if we are in "edit" mode
  });
};

// Hook for creating a new service type
export function useAddServiceType() {
  const queryClient = useQueryClient();
  return useMutation<ServiceTypeRead, AxiosError<{ detail: any }>, ServiceTypeCreate>({
    mutationFn: async (serviceTypeData) => {
      const { data } = await axios.post(`${API_BASE_URL}/service_types/`, serviceTypeData);
      return data;
    },
    onSuccess: (newServiceType) => {
      toast.success(`Service type "${newServiceType.name}" created successfully.`);
      queryClient.invalidateQueries({ queryKey: ["service_types"] });
    },
    onError: (error) => {
      const errorMsg = error.response?.data?.detail?.[0]?.msg || error.response?.data?.detail || "Failed to create service type.";
      toast.error(errorMsg);
    },
  });
}

interface UpdateServiceTypeVariables {
  id: number;
  serviceTypeData: ServiceTypeUpdate;
}

// Hook for updating an existing service type
export function useUpdateServiceType() {
  const queryClient = useQueryClient();
  return useMutation<ServiceTypeRead, AxiosError<{ detail: any }>, UpdateServiceTypeVariables>({
    mutationFn: async ({ id, serviceTypeData }) => {
      const { data } = await axios.put(`${API_BASE_URL}/service_types/${id}`, serviceTypeData);
      return data;
    },
    onSuccess: (updatedServiceType) => {
      toast.success(`Service type "${updatedServiceType.name}" updated successfully.`);
      queryClient.invalidateQueries({ queryKey: ["service_types"] });
      // Immediately update the cache for this specific service type
      queryClient.setQueryData(["service_types", updatedServiceType.id.toString()], updatedServiceType);
    },
    onError: (error) => {
      const errorMsg = error.response?.data?.detail?.[0]?.msg || error.response?.data?.detail || "Failed to update service type.";
      toast.error(errorMsg);
    },
  });
}

export function useServiceTypes() {
  return useQuery<ServiceTypeRead[]>({
    queryKey: ["service_types"],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/service_types/`);
      return data;
    },
  });
}

// Hook for deleting a service type
export function useDeleteServiceType() {
  const queryClient = useQueryClient();
  return useMutation<void, AxiosError<{ detail: string }>, number>({
    mutationFn: async (serviceTypeId) => {
      await axios.delete(`${API_BASE_URL}/service_types/${serviceTypeId}`);
    },
    onSuccess: () => {
      toast.success("Service type deleted successfully.");
      // Invalidate the main list to trigger a re-fetch
      queryClient.invalidateQueries({ queryKey: ["service_types"] });
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to delete service type.");
    },
  });
}

// --- MAINTENANCE LOG HOOKS ---

// Hook for fetching a single maintenance log
export const useMaintenanceLog = (logId?: string) => {
  return useQuery<MaintenanceLogRead, AxiosError<{ detail: string }>>({
    queryKey: ["maintenance_logs", logId],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/maintenance_logs/${logId}`);
      return data;
    },
    enabled: !!logId, // Only run if logId is provided (i.e., in "edit" mode)
  });
};

// Hook for fetching custom fields for a given service type
export const useCustomFieldsForServiceType = (serviceTypeId?: string | number) => {
  return useQuery<CustomFieldRead[], AxiosError<{ detail: string }>>({
    queryKey: ["custom_fields", serviceTypeId],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/service_types/${serviceTypeId}/custom_fields/`);
      return data;
    },
    enabled: !!serviceTypeId, // Only run if a service type is selected
  });
};

interface AddLogVariables {
  vehicleId: number;
  logData: MaintenanceLogCreate;
}

// Hook for creating a new maintenance log
export function useAddMaintenanceLog() {
  const queryClient = useQueryClient();
  return useMutation<MaintenanceLogRead, AxiosError<{ detail: any }>, AddLogVariables>({
    mutationFn: async ({ vehicleId, logData }) => {
      const { data } = await axios.post(`${API_BASE_URL}/vehicles/${vehicleId}/logs/`, logData);
      return data;
    },
    onSuccess: (_, { vehicleId }) => {
      toast.success("Maintenance log added successfully.");
      // Invalidate vehicle-specific queries to refresh log lists, summaries, etc.
      queryClient.invalidateQueries({ queryKey: ["vehicles", vehicleId.toString()] });
      queryClient.invalidateQueries({ queryKey: ["maintenance_logs"] }); // Invalidate general log list if you have one
    },
    onError: (error) => {
      const errorMsg = error.response?.data?.detail?.[0]?.msg || error.response?.data?.detail || "Failed to add log.";
      toast.error(errorMsg);
    },
  });
}

interface UpdateLogVariables {
  logId: number;
  logData: MaintenanceLogUpdate;
}

// Hook for updating an existing maintenance log
export function useUpdateMaintenanceLog() {
  const queryClient = useQueryClient();
  return useMutation<MaintenanceLogRead, AxiosError<{ detail: any }>, UpdateLogVariables>({
    mutationFn: async ({ logId, logData }) => {
      const { data } = await axios.put(`${API_BASE_URL}/maintenance_logs/${logId}`, logData);
      return data;
    },
    onSuccess: (updatedLog) => {
      toast.success("Maintenance log updated successfully.");
      // Invalidate vehicle-specific queries
      queryClient.invalidateQueries({ queryKey: ["vehicles", updatedLog.vehicle_id.toString()] });
      // Immediately update the cache for this specific log
      queryClient.setQueryData(["maintenance_logs", updatedLog.id.toString()], updatedLog);
    },
    onError: (error) => {
      const errorMsg = error.response?.data?.detail?.[0]?.msg || error.response?.data?.detail || "Failed to update log.";
      toast.error(errorMsg);
    },
  });
}

// Hook for fetching all logs for a specific service type on a specific vehicle
export const useLogsForServiceType = (vehicleId?: string, serviceTypeId?: string) => {
  return useQuery<MaintenanceLogRead[], AxiosError<{ detail: string }>>({
    queryKey: ["maintenance_logs", { vehicleId, serviceTypeId }], // A more specific query key
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/vehicles/${vehicleId}/logs?service_type_id=${serviceTypeId}`);
      return data;
    },
    // Only run this query if both IDs are present
    enabled: !!vehicleId && !!serviceTypeId,
  });
};

// --- SUMMARY & LOG HOOKS ---

export function useServiceTypeSummaries(vehicleId?: string) {
  return useQuery<ServiceTypeLogSummary[]>({
    queryKey: ["summaries", vehicleId],
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/vehicles/${vehicleId}/maintenance_summary_by_type`);
      return data;
    },
    enabled: !!vehicleId,
  });
}

export const useAllLogsForVehicle = (vehicleId?: string) => {
  return useQuery<MaintenanceLogRead[]>({
    queryKey: ["maintenance_logs", { vehicleId }], // More specific key
    queryFn: async () => {
      const { data } = await axios.get(`${API_BASE_URL}/vehicles/${vehicleId}/logs`);
      return data;
    },
    enabled: !!vehicleId,
  });
};

// We also need a mutation hook for deleting a log
export function useDeleteMaintenanceLog() {
  const queryClient = useQueryClient();
  return useMutation<void, AxiosError<{ detail: string }>, { logId: number; vehicleId: string }>({
    mutationFn: async ({ logId }) => {
      await axios.delete(`${API_BASE_URL}/maintenance_logs/${logId}`);
    },
    onSuccess: (_, { vehicleId }) => {
      toast.success("Log deleted successfully.");
      // When a log is deleted, many things could be stale.
      // Invalidate the vehicle (for its log list), the summaries, and the log lists.
      queryClient.invalidateQueries({ queryKey: ["vehicles", vehicleId] });
      queryClient.invalidateQueries({ queryKey: ["summaries", vehicleId] });
      queryClient.invalidateQueries({ queryKey: ["maintenance_logs"] });
    },
    onError: (error) => {
      toast.error(error.response?.data?.detail || "Failed to delete log.");
    },
  });
}

// --- HEALTH CHECK ---
export const checkBackendHealth = async () => {
  try {
    await axios.get(API_BASE_URL);
    return true;
  } catch (error) {
    // Don't show an error toast for health checks
    return false;
  }
};
