// Module-level access to the shared repository in @carbaddie/core (packages/core/src/db/repository.ts).
import type { Repository } from "@carbaddie/core";
import { getRepository } from "./schema";

function call<K extends keyof Repository>(method: K) {
  return async (...args: Parameters<Repository[K]>): Promise<Awaited<ReturnType<Repository[K]>>> => {
    const repo = await getRepository();
    return (repo[method] as (...a: Parameters<Repository[K]>) => any)(...args);
  };
}

export const getAllVehicles = call("getAllVehicles");
export const getVehicleById = call("getVehicleById");
export const createVehicle = call("createVehicle");
export const updateVehicle = call("updateVehicle");
export const deleteVehicle = call("deleteVehicle");
export const deleteAllVehicles = call("deleteAllVehicles");

export const getAllServiceTypes = call("getAllServiceTypes");
export const getServiceTypeById = call("getServiceTypeById");
export const createServiceType = call("createServiceType");
export const updateServiceType = call("updateServiceType");
export const deleteServiceType = call("deleteServiceType");
export const getCustomFieldsForServiceType = call("getCustomFieldsForServiceType");

export const getLogsForVehicle = call("getLogsForVehicle");
export const getLogById = call("getLogById");
export const createMaintenanceLog = call("createMaintenanceLog");
export const updateMaintenanceLog = call("updateMaintenanceLog");
export const deleteMaintenanceLog = call("deleteMaintenanceLog");

export const getOverridesForVehicle = call("getOverridesForVehicle");
export const upsertIntervalOverride = call("upsertIntervalOverride");
export const deleteIntervalOverride = call("deleteIntervalOverride");

export const getMaintenanceSummary = call("getMaintenanceSummary");
export const getServiceTypeSummaries = call("getServiceTypeSummaries");

export const getSetting = call("getSetting");
export const setSetting = call("setSetting");
export const removeSetting = call("removeSetting");
