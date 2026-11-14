// React Query hooks over the local repository (@carbaddie/core, opened in ./db.ts).
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import type {
  Id,
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
  Preferences,
  ServiceEventRead,
  ServiceEventCreate,
  ServiceEventUpdate,
} from "./types";
import { getRepository } from "./db";
import { queryKeys } from "./queryKeys";

const message = (error: unknown, fallback: string) => (error instanceof Error && error.message ? error.message : fallback);

// --- PREFERENCES (synced: currency, distance unit) ---

export function usePreferences() {
  return useQuery<Preferences>({
    queryKey: queryKeys.preferences(),
    queryFn: async () => (await getRepository()).getPreferences(),
  });
}

export function useSetPreference() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { key: keyof Preferences; value: string }>({
    mutationFn: async ({ key, value }) =>
      (await getRepository()).setPreference(key, value as Preferences[typeof key]),
    // Every money and distance on screen depends on these.
    onSuccess: () => queryClient.invalidateQueries(),
    onError: (error) => toast.error(message(error, "Failed to save the preference.")),
  });
}

// --- VEHICLE HOOKS ---

export function useVehicles() {
  return useQuery<VehicleRead[]>({
    queryKey: queryKeys.vehicles.all(),
    queryFn: async () => (await getRepository()).getAllVehicles(),
  });
}

export const useVehicle = (vehicleId?: Id) => {
  return useQuery<VehicleRead | null>({
    queryKey: queryKeys.vehicles.one(vehicleId as string),
    queryFn: async () => (await getRepository()).getVehicleById(vehicleId!),
    enabled: !!vehicleId,
  });
};

export function useAddVehicle() {
  const queryClient = useQueryClient();
  return useMutation<VehicleRead, Error, VehicleCreate>({
    mutationFn: async (vehicle) => (await getRepository()).createVehicle(vehicle),
    onSuccess: (newVehicle) => {
      toast.success(`Vehicle "${newVehicle.make} ${newVehicle.model}" added successfully!`);
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all() });
    },
    onError: (error) => toast.error(message(error, "Failed to add vehicle.")),
  });
}

interface UpdateVehicleVariables {
  id: Id;
  vehicleData: VehicleUpdate;
}

export function useUpdateVehicle() {
  const queryClient = useQueryClient();
  return useMutation<VehicleRead, Error, UpdateVehicleVariables>({
    mutationFn: async ({ id, vehicleData }) => (await getRepository()).updateVehicle(id, vehicleData),
    onSuccess: (updatedVehicle) => {
      toast.success(`Vehicle "${updatedVehicle.make} ${updatedVehicle.model}" updated.`);
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all() });
      queryClient.setQueryData(queryKeys.vehicles.one(updatedVehicle.id), updatedVehicle);
    },
    onError: (error) => toast.error(message(error, "Failed to update vehicle.")),
  });
}

export function useDeleteVehicle() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, Id>({
    mutationFn: async (vehicleId) => (await getRepository()).deleteVehicle(vehicleId),
    onSuccess: () => {
      toast.success("Vehicle deleted successfully.");
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.all() });
    },
    onError: (error) => toast.error(message(error, "Failed to delete vehicle.")),
  });
}

// ====================================================================
//  Backup and Restore Hooks
// ====================================================================

/** Builds a backup file. Returns it as a JSON Blob, ready to save or upload. */
export function useExportBackup() {
  return useMutation<Blob, Error, BackupConfiguration>({
    mutationFn: async (config) => {
      const backup = await (await getRepository()).exportBackup(config);
      return new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    },
  });
}

/** Compares a parsed backup (see `parseBackup`) with local data. */
export function useAnalyzeBackup() {
  return useMutation<BackupAnalysisResponse, Error, FullBackupData>({
    mutationFn: async (backup) => (await getRepository()).analyzeBackup(backup),
    onError: (error) => toast.error(message(error, "Failed to analyze backup.")),
  });
}

interface RestorePayload {
  plan: RestorePlan;
  backup_data: FullBackupData;
}

export function useRestoreBackup() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, RestorePayload>({
    mutationFn: async ({ plan, backup_data }) => (await getRepository()).importBackup(backup_data, plan),
    onSuccess: () => {
      // A restore can touch anything: refetch everything.
      queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(message(error, "Failed to restore backup.")),
  });
}

interface UpsertOverrideVariables {
  vehicleId: Id;
  serviceTypeId: Id;
  overrideData: VehicleServiceIntervalOverrideCreate;
}

export function useUpsertIntervalOverride() {
  const queryClient = useQueryClient();
  return useMutation<VehicleServiceIntervalOverrideRead, Error, UpsertOverrideVariables>({
    mutationFn: async ({ vehicleId, serviceTypeId, overrideData }) =>
      (await getRepository()).upsertIntervalOverride(vehicleId, serviceTypeId, overrideData),
    onSuccess: (_, { vehicleId }) => {
      toast.success("Interval override saved successfully.");
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.one(vehicleId) });
    },
    onError: (error) => toast.error(message(error, "Failed to save override.")),
  });
}

interface DeleteOverrideVariables {
  vehicleId: Id;
  serviceTypeId: Id;
}

export function useDeleteIntervalOverride() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, DeleteOverrideVariables>({
    mutationFn: async ({ vehicleId, serviceTypeId }) => (await getRepository()).deleteIntervalOverride(vehicleId, serviceTypeId),
    onSuccess: (_, { vehicleId }) => {
      toast.success("Interval override cleared.");
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.one(vehicleId) });
    },
    onError: (error) => toast.error(message(error, "Failed to clear override.")),
  });
}

// --- SERVICE TYPE HOOKS ---

export const useServiceType = (serviceTypeId?: Id) => {
  return useQuery<ServiceTypeRead | null, Error>({
    queryKey: queryKeys.serviceTypes.one(serviceTypeId as string),
    queryFn: async () => (await getRepository()).getServiceTypeById(serviceTypeId!),
    enabled: !!serviceTypeId,
  });
};

export function useAddServiceType() {
  const queryClient = useQueryClient();
  return useMutation<ServiceTypeRead, Error, ServiceTypeCreate>({
    mutationFn: async (serviceTypeData) => (await getRepository()).createServiceType(serviceTypeData),
    onSuccess: (newServiceType) => {
      toast.success(`Service type "${newServiceType.name}" created successfully.`);
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceTypes.all() });
    },
    onError: (error) => toast.error(message(error, "Failed to create service type.")),
  });
}

interface UpdateServiceTypeVariables {
  id: Id;
  serviceTypeData: ServiceTypeUpdate;
}

export function useUpdateServiceType() {
  const queryClient = useQueryClient();
  return useMutation<ServiceTypeRead, Error, UpdateServiceTypeVariables>({
    mutationFn: async ({ id, serviceTypeData }) => (await getRepository()).updateServiceType(id, serviceTypeData),
    onSuccess: (updatedServiceType) => {
      toast.success(`Service type "${updatedServiceType.name}" updated successfully.`);
      queryClient.invalidateQueries({ queryKey: queryKeys.serviceTypes.all() });
      queryClient.setQueryData(queryKeys.serviceTypes.one(updatedServiceType.id), updatedServiceType);
    },
    onError: (error) => toast.error(message(error, "Failed to update service type.")),
  });
}

export function useServiceTypes() {
  return useQuery<ServiceTypeRead[]>({
    queryKey: queryKeys.serviceTypes.all(),
    queryFn: async () => (await getRepository()).getAllServiceTypes(),
  });
}

export function useDeleteServiceType() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, Id>({
    mutationFn: async (serviceTypeId) => (await getRepository()).deleteServiceType(serviceTypeId),
    onSuccess: () => {
      toast.success("Service type deleted successfully.");
      // Logs and overrides of other queries may reference it too.
      queryClient.invalidateQueries();
    },
    onError: (error) => toast.error(message(error, "Failed to delete service type.")),
  });
}

// --- MAINTENANCE LOG HOOKS ---

export const useMaintenanceLog = (logId?: Id) => {
  return useQuery<MaintenanceLogRead | null, Error>({
    queryKey: queryKeys.logs.one(logId as string),
    queryFn: async () => (await getRepository()).getLogById(logId!),
    enabled: !!logId,
  });
};

export const useCustomFieldsForServiceType = (serviceTypeId?: Id) => {
  return useQuery<CustomFieldRead[], Error>({
    queryKey: queryKeys.serviceTypes.customFields(serviceTypeId as string),
    queryFn: async () => (await getRepository()).getCustomFieldsForServiceType(serviceTypeId!),
    enabled: !!serviceTypeId,
  });
};

interface AddLogVariables {
  vehicleId: Id;
  logData: MaintenanceLogCreate;
}

export function useAddMaintenanceLog() {
  const queryClient = useQueryClient();
  return useMutation<MaintenanceLogRead, Error, AddLogVariables>({
    mutationFn: async ({ vehicleId, logData }) => (await getRepository()).createMaintenanceLog(vehicleId, logData),
    onSuccess: (_, { vehicleId }) => {
      toast.success("Maintenance log added successfully.");
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.one(vehicleId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.summaries.forVehicle(vehicleId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.logs.all() });
    },
    onError: (error) => toast.error(message(error, "Failed to add log.")),
  });
}

interface UpdateLogVariables {
  logId: Id;
  logData: MaintenanceLogUpdate;
}

export function useUpdateMaintenanceLog() {
  const queryClient = useQueryClient();
  return useMutation<MaintenanceLogRead, Error, UpdateLogVariables>({
    mutationFn: async ({ logId, logData }) => (await getRepository()).updateMaintenanceLog(logId, logData),
    onSuccess: (updatedLog) => {
      toast.success("Maintenance log updated successfully.");
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.one(updatedLog.vehicle_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.summaries.forVehicle(updatedLog.vehicle_id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.logs.all() });
      queryClient.setQueryData(queryKeys.logs.one(updatedLog.id), updatedLog);
    },
    onError: (error) => toast.error(message(error, "Failed to update log.")),
  });
}

export const useLogsForServiceType = (vehicleId?: Id, serviceTypeId?: Id) => {
  return useQuery<MaintenanceLogRead[], Error>({
    queryKey: queryKeys.logs.forServiceType(vehicleId as string, serviceTypeId as string),
    queryFn: async () => (await getRepository()).getLogsForVehicle(vehicleId!, serviceTypeId!),
    enabled: !!vehicleId && !!serviceTypeId,
  });
};

// --- SUMMARY & LOG HOOKS ---

export function useServiceTypeSummaries(vehicleId?: Id) {
  return useQuery<ServiceTypeLogSummary[]>({
    queryKey: queryKeys.summaries.forVehicle(vehicleId as string),
    queryFn: async () => (await getRepository()).getServiceTypeSummaries(vehicleId!),
    enabled: !!vehicleId,
  });
}

export const useAllLogsForVehicle = (vehicleId?: Id) => {
  return useQuery<MaintenanceLogRead[]>({
    queryKey: queryKeys.logs.forVehicle(vehicleId as string),
    queryFn: async () => (await getRepository()).getLogsForVehicle(vehicleId!),
    enabled: !!vehicleId,
  });
};

export function useDeleteMaintenanceLog() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { logId: Id; vehicleId: Id }>({
    mutationFn: async ({ logId }) => (await getRepository()).deleteMaintenanceLog(logId),
    onSuccess: (_, { vehicleId }) => {
      toast.success("Log deleted successfully.");
      queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.one(vehicleId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.summaries.forVehicle(vehicleId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.logs.all() });
    },
    onError: (error) => toast.error(message(error, "Failed to delete log.")),
  });
}

// --- GARAGE VISIT HOOKS (service events; their items are maintenance logs) ---

/** Newest first; logs recorded on their own come back as single-item visits (`standalone: true`). */
export const useVisitsForVehicle = (vehicleId?: Id) => {
  return useQuery<ServiceEventRead[]>({
    queryKey: queryKeys.visits.forVehicle(vehicleId as string),
    queryFn: async () => (await getRepository()).getVisitsForVehicle(vehicleId!),
    enabled: !!vehicleId,
  });
};

export const useServiceEvent = (visitId?: Id) => {
  return useQuery<ServiceEventRead | null, Error>({
    queryKey: queryKeys.visits.one(visitId as string),
    queryFn: async () => (await getRepository()).getServiceEvent(visitId!),
    enabled: !!visitId,
  });
};

/** Visits change logs: refresh everything that shows a vehicle's logs (visit keys sit under logs.all()). */
function invalidateVehicleLogs(queryClient: ReturnType<typeof useQueryClient>, vehicleId: Id) {
  queryClient.invalidateQueries({ queryKey: queryKeys.vehicles.one(vehicleId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.summaries.forVehicle(vehicleId) });
  queryClient.invalidateQueries({ queryKey: queryKeys.logs.all() });
}

export function useAddServiceEvent() {
  const queryClient = useQueryClient();
  return useMutation<ServiceEventRead, Error, { vehicleId: Id; visitData: ServiceEventCreate }>({
    mutationFn: async ({ vehicleId, visitData }) => (await getRepository()).createServiceEvent(vehicleId, visitData),
    onSuccess: (visit) => {
      toast.success(visit.items.length === 1 ? "Visit recorded." : `Visit recorded with ${visit.items.length} services.`);
      invalidateVehicleLogs(queryClient, visit.vehicle_id);
    },
    onError: (error) => toast.error(message(error, "Failed to record visit.")),
  });
}

export function useUpdateServiceEvent() {
  const queryClient = useQueryClient();
  return useMutation<ServiceEventRead, Error, { visitId: Id; visitData: ServiceEventUpdate }>({
    mutationFn: async ({ visitId, visitData }) => (await getRepository()).updateServiceEvent(visitId, visitData),
    onSuccess: (visit) => {
      toast.success("Visit updated.");
      invalidateVehicleLogs(queryClient, visit.vehicle_id);
    },
    onError: (error) => toast.error(message(error, "Failed to update visit.")),
  });
}

export function useDeleteServiceEvent() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, { visitId: Id; vehicleId: Id }>({
    mutationFn: async ({ visitId }) => (await getRepository()).deleteServiceEvent(visitId),
    onSuccess: (_, { vehicleId }) => {
      toast.success("Visit deleted.");
      invalidateVehicleLogs(queryClient, vehicleId);
    },
    onError: (error) => toast.error(message(error, "Failed to delete visit.")),
  });
}

// --- WIPE DATABASE ---

/** Deletes every vehicle with its logs and overrides. Service types are kept. */
export function useWipeDatabase() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, void>({
    mutationFn: async () => (await getRepository()).deleteAllVehicles(),
    onSuccess: () => {
      queryClient.invalidateQueries();
      toast.success("All garage records have been wiped.");
    },
    onError: (error) => toast.error(message(error, "Failed to wipe database.")),
  });
}
