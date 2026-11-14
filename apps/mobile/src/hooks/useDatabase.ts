import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as repo from "../db/repository";
import { triggerBackgroundCloudPush } from "../services/googleDrive";
import type {
  VehicleRead, VehicleCreate, VehicleUpdate,
  ServiceTypeRead, ServiceTypeCreate, ServiceTypeUpdate,
  MaintenanceLogRead, MaintenanceLogCreate, MaintenanceLogUpdate,
  VehicleServiceIntervalOverrideCreate, VehicleServiceIntervalOverrideRead,
  ServiceTypeLogSummary, CustomFieldRead, Preferences,
  OdometerReadingCreate, OdometerReadingRead,
} from "../types";

// ====================================================================
// QUERY KEYS — Same structure as the PC app
// ====================================================================

export const queryKeys = {
  vehicles: {
    all: () => ["vehicles"] as const,
    one: (id: string) => ["vehicles", String(id)] as const,
  },
  serviceTypes: {
    all: () => ["serviceTypes"] as const,
    one: (id: string) => ["serviceTypes", String(id)] as const,
    customFields: (id: string) => ["serviceTypes", String(id), "fields"] as const,
  },
  logs: {
    all: () => ["logs"] as const,
    one: (id: string) => ["logs", String(id)] as const,
    forVehicle: (vehicleId: string) => ["logs", "vehicle", String(vehicleId)] as const,
    forServiceType: (vehicleId: string, stId: string) =>
      ["logs", "vehicle", String(vehicleId), "serviceType", String(stId)] as const,
  },
  summaries: {
    forVehicle: (vehicleId: string) => ["summaries", String(vehicleId)] as const,
  },
  preferences: () => ["preferences"] as const,
};

// ====================================================================
// PREFERENCES (synced: currency, distance unit)
// ====================================================================

export function usePreferences() {
  return useQuery<Preferences>({
    queryKey: queryKeys.preferences(),
    queryFn: () => repo.getPreferences(),
  });
}

export function useSetPreference() {
  const qc = useQueryClient();
  return useMutation<void, Error, { key: keyof Preferences; value: string }>({
    mutationFn: ({ key, value }) => repo.setPreference(key, value as Preferences[typeof key]),
    onSuccess: () => {
      qc.invalidateQueries(); // every money and distance on screen depends on these
      triggerBackgroundCloudPush();
    },
  });
}

// ====================================================================
// VEHICLE HOOKS
// ====================================================================

export function useVehicles() {
  return useQuery<VehicleRead[]>({
    queryKey: queryKeys.vehicles.all(),
    queryFn: () => repo.getAllVehicles(),
  });
}

export function useVehicle(vehicleId?: string) {
  const id = vehicleId || undefined;
  return useQuery<VehicleRead | null>({
    queryKey: queryKeys.vehicles.one(id!),
    queryFn: () => repo.getVehicleById(id!),
    enabled: !!id,
  });
}

export function useAddVehicle() {
  const qc = useQueryClient();
  return useMutation<VehicleRead, Error, VehicleCreate>({
    mutationFn: (data) => repo.createVehicle(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.vehicles.all() });
      triggerBackgroundCloudPush();
    },
  });
}

export function useUpdateVehicle() {
  const qc = useQueryClient();
  return useMutation<VehicleRead, Error, { id: string; data: VehicleUpdate }>({
    mutationFn: ({ id, data }) => repo.updateVehicle(id, data),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: queryKeys.vehicles.all() });
      qc.setQueryData(queryKeys.vehicles.one(updated.id), updated);
      triggerBackgroundCloudPush();
    },
  });
}

export function useDeleteVehicle() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => repo.deleteVehicle(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.vehicles.all() });
      triggerBackgroundCloudPush();
    },
  });
}

// ====================================================================
// SERVICE TYPE HOOKS
// ====================================================================

export function useServiceTypes() {
  return useQuery<ServiceTypeRead[]>({
    queryKey: queryKeys.serviceTypes.all(),
    queryFn: () => repo.getAllServiceTypes(),
  });
}

export function useServiceType(id?: string) {
  const numId = id || undefined;
  return useQuery<ServiceTypeRead | null>({
    queryKey: queryKeys.serviceTypes.one(numId!),
    queryFn: () => repo.getServiceTypeById(numId!),
    enabled: !!numId,
  });
}

export function useAddServiceType() {
  const qc = useQueryClient();
  return useMutation<ServiceTypeRead, Error, ServiceTypeCreate>({
    mutationFn: (data) => repo.createServiceType(data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.serviceTypes.all() }); },
  });
}

export function useUpdateServiceType() {
  const qc = useQueryClient();
  return useMutation<ServiceTypeRead, Error, { id: string; data: ServiceTypeUpdate }>({
    mutationFn: ({ id, data }) => repo.updateServiceType(id, data),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: queryKeys.serviceTypes.all() });
      qc.setQueryData(queryKeys.serviceTypes.one(updated.id), updated);
    },
  });
}

export function useDeleteServiceType() {
  const qc = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => repo.deleteServiceType(id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: queryKeys.serviceTypes.all() }); },
  });
}

export function useCustomFieldsForServiceType(serviceTypeId?: string) {
  const numId = serviceTypeId || undefined;
  return useQuery<CustomFieldRead[]>({
    queryKey: queryKeys.serviceTypes.customFields(numId!),
    queryFn: () => repo.getCustomFieldsForServiceType(numId!),
    enabled: !!numId,
  });
}

// ====================================================================
// MAINTENANCE LOG HOOKS
// ====================================================================

export function useLogsForVehicle(vehicleId?: string) {
  const id = vehicleId || undefined;
  return useQuery<MaintenanceLogRead[]>({
    queryKey: queryKeys.logs.forVehicle(id!),
    queryFn: () => repo.getLogsForVehicle(id!),
    enabled: !!id,
  });
}

export function useLogsForServiceType(vehicleId?: string, serviceTypeId?: string) {
  const vId = vehicleId || undefined;
  const stId = serviceTypeId || undefined;
  return useQuery<MaintenanceLogRead[]>({
    queryKey: queryKeys.logs.forServiceType(vId!, stId!),
    queryFn: () => repo.getLogsForVehicle(vId!, stId!),
    enabled: !!vId && !!stId,
  });
}

export function useMaintenanceLog(logId?: string) {
  const id = logId || undefined;
  return useQuery<MaintenanceLogRead | null>({
    queryKey: queryKeys.logs.one(id!),
    queryFn: () => repo.getLogById(id!),
    enabled: !!id,
  });
}

export function useAddMaintenanceLog() {
  const qc = useQueryClient();
  return useMutation<MaintenanceLogRead, Error, { vehicleId: string; data: MaintenanceLogCreate }>({
    mutationFn: ({ vehicleId, data }) => repo.createMaintenanceLog(vehicleId, data),
    onSuccess: (_, { vehicleId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.vehicles.one(vehicleId) });
      qc.invalidateQueries({ queryKey: queryKeys.logs.forVehicle(vehicleId) });
      qc.invalidateQueries({ queryKey: queryKeys.summaries.forVehicle(vehicleId) });
      triggerBackgroundCloudPush();
    },
  });
}

export function useUpdateMaintenanceLog() {
  const qc = useQueryClient();
  return useMutation<MaintenanceLogRead, Error, { logId: string; data: MaintenanceLogUpdate }>({
    mutationFn: ({ logId, data }) => repo.updateMaintenanceLog(logId, data),
    onSuccess: (updated) => {
      qc.invalidateQueries({ queryKey: queryKeys.vehicles.one(updated.vehicle_id) });
      qc.invalidateQueries({ queryKey: queryKeys.logs.forVehicle(updated.vehicle_id) });
      qc.setQueryData(queryKeys.logs.one(updated.id), updated);
      triggerBackgroundCloudPush();
    },
  });
}

export function useDeleteMaintenanceLog() {
  const qc = useQueryClient();
  return useMutation<void, Error, { logId: string; vehicleId: string }>({
    mutationFn: ({ logId }) => repo.deleteMaintenanceLog(logId),
    onSuccess: (_, { vehicleId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.vehicles.one(vehicleId) });
      qc.invalidateQueries({ queryKey: queryKeys.logs.forVehicle(vehicleId) });
      qc.invalidateQueries({ queryKey: queryKeys.summaries.forVehicle(vehicleId) });
      triggerBackgroundCloudPush();
    },
  });
}

// ====================================================================
// ODOMETER READING HOOKS (readings are part of VehicleRead)
// ====================================================================

export function useAddOdometerReading() {
  const qc = useQueryClient();
  return useMutation<OdometerReadingRead, Error, { vehicleId: string; data: OdometerReadingCreate }>({
    mutationFn: ({ vehicleId, data }) => repo.addOdometerReading(vehicleId, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.vehicles.all() });
      triggerBackgroundCloudPush();
    },
  });
}

export function useDeleteOdometerReading() {
  const qc = useQueryClient();
  return useMutation<void, Error, { readingId: string; vehicleId: string }>({
    mutationFn: ({ readingId }) => repo.deleteOdometerReading(readingId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.vehicles.all() });
      triggerBackgroundCloudPush();
    },
  });
}

// ====================================================================
// INTERVAL OVERRIDE HOOKS
// ====================================================================

export function useUpsertIntervalOverride() {
  const qc = useQueryClient();
  return useMutation<VehicleServiceIntervalOverrideRead, Error, {
    vehicleId: string; serviceTypeId: string; data: VehicleServiceIntervalOverrideCreate;
  }>({
    mutationFn: ({ vehicleId, serviceTypeId, data }) =>
      repo.upsertIntervalOverride(vehicleId, serviceTypeId, data),
    onSuccess: (_, { vehicleId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.vehicles.one(vehicleId) });
      triggerBackgroundCloudPush();
    },
  });
}

export function useDeleteIntervalOverride() {
  const qc = useQueryClient();
  return useMutation<void, Error, { vehicleId: string; serviceTypeId: string }>({
    mutationFn: ({ vehicleId, serviceTypeId }) =>
      repo.deleteIntervalOverride(vehicleId, serviceTypeId),
    onSuccess: (_, { vehicleId }) => {
      qc.invalidateQueries({ queryKey: queryKeys.vehicles.one(vehicleId) });
      triggerBackgroundCloudPush();
    },
  });
}

// ====================================================================
// SUMMARY HOOKS
// ====================================================================

export function useServiceTypeSummaries(vehicleId?: string) {
  const id = vehicleId || undefined;
  return useQuery<ServiceTypeLogSummary[]>({
    queryKey: queryKeys.summaries.forVehicle(id!),
    queryFn: () => repo.getServiceTypeSummaries(id!),
    enabled: !!id,
  });
}
