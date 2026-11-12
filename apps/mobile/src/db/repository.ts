import { getDatabase } from "./schema";
import type {
  VehicleCreate, VehicleUpdate, VehicleRead,
  ServiceTypeCreate, ServiceTypeUpdate, ServiceTypeRead,
  CustomFieldRead, CustomFieldValueRead,
  MaintenanceLogCreate, MaintenanceLogUpdate, MaintenanceLogRead,
  VehicleServiceIntervalOverrideCreate, VehicleServiceIntervalOverrideRead,
  ServiceTypeLogSummary, MaintenanceSummary,
} from "../types";

// ====================================================================
// VEHICLE CRUD
// ====================================================================

export async function getAllVehicles(): Promise<VehicleRead[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>("SELECT * FROM vehicles ORDER BY id DESC");
  const vehicles: VehicleRead[] = [];
  for (const row of rows) {
    vehicles.push(await buildVehicleRead(row));
  }
  return vehicles;
}

export async function getVehicleById(id: number): Promise<VehicleRead | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>("SELECT * FROM vehicles WHERE id = ?", [id]);
  if (!row) return null;
  return buildVehicleRead(row);
}

export async function createVehicle(data: VehicleCreate): Promise<VehicleRead> {
  const db = await getDatabase();
  const result = await db.runAsync(
    "INSERT INTO vehicles (make, model, year, vin, initial_mileage, acquisition_date) VALUES (?, ?, ?, ?, ?, ?)",
    [data.make, data.model, data.year ?? null, data.vin ?? null, data.initial_mileage ?? null, data.acquisition_date ?? null]
  );
  return (await getVehicleById(result.lastInsertRowId))!;
}

export async function updateVehicle(id: number, data: VehicleUpdate): Promise<VehicleRead> {
  const db = await getDatabase();
  const sets: string[] = [];
  const vals: any[] = [];
  if (data.make !== undefined) { sets.push("make = ?"); vals.push(data.make); }
  if (data.model !== undefined) { sets.push("model = ?"); vals.push(data.model); }
  if (data.year !== undefined) { sets.push("year = ?"); vals.push(data.year); }
  if (data.vin !== undefined) { sets.push("vin = ?"); vals.push(data.vin); }
  if (data.initial_mileage !== undefined) { sets.push("initial_mileage = ?"); vals.push(data.initial_mileage); }
  if (data.acquisition_date !== undefined) { sets.push("acquisition_date = ?"); vals.push(data.acquisition_date); }
  if (sets.length > 0) {
    vals.push(id);
    await db.runAsync(`UPDATE vehicles SET ${sets.join(", ")} WHERE id = ?`, vals);
  }
  return (await getVehicleById(id))!;
}

export async function deleteVehicle(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM vehicles WHERE id = ?", [id]);
}

// ====================================================================
// SERVICE TYPE CRUD
// ====================================================================

export async function getAllServiceTypes(): Promise<ServiceTypeRead[]> {
  const db = await getDatabase();
  const rows = await db.getAllAsync<any>("SELECT * FROM service_types ORDER BY name ASC");
  const types: ServiceTypeRead[] = [];
  for (const row of rows) {
    types.push(await buildServiceTypeRead(row));
  }
  return types;
}

export async function getServiceTypeById(id: number): Promise<ServiceTypeRead | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>("SELECT * FROM service_types WHERE id = ?", [id]);
  if (!row) return null;
  return buildServiceTypeRead(row);
}

export async function createServiceType(data: ServiceTypeCreate): Promise<ServiceTypeRead> {
  const db = await getDatabase();
  const result = await db.runAsync(
    "INSERT INTO service_types (name, recommended_interval_km, recommended_interval_days) VALUES (?, ?, ?)",
    [data.name, data.recommended_interval_km ?? null, data.recommended_interval_days ?? null]
  );
  const newId = result.lastInsertRowId;
  // Create custom fields
  for (const field of data.fields) {
    await db.runAsync(
      "INSERT INTO custom_fields (service_type_id, name, field_type, unit) VALUES (?, ?, ?, ?)",
      [newId, field.name, field.field_type, field.unit ?? null]
    );
  }
  // Create resets
  for (const resetId of (data.resets ?? [])) {
    await db.runAsync("INSERT OR IGNORE INTO service_type_resets (parent_id, reset_id) VALUES (?, ?)", [newId, resetId]);
  }
  // Create suggestions
  for (const sugId of (data.suggestions ?? [])) {
    await db.runAsync("INSERT OR IGNORE INTO service_type_suggestions (parent_id, suggestion_id) VALUES (?, ?)", [newId, sugId]);
  }
  return (await getServiceTypeById(newId))!;
}

export async function updateServiceType(id: number, data: ServiceTypeUpdate): Promise<ServiceTypeRead> {
  const db = await getDatabase();
  const sets: string[] = [];
  const vals: any[] = [];
  if (data.name !== undefined) { sets.push("name = ?"); vals.push(data.name); }
  if (data.recommended_interval_km !== undefined) { sets.push("recommended_interval_km = ?"); vals.push(data.recommended_interval_km); }
  if (data.recommended_interval_days !== undefined) { sets.push("recommended_interval_days = ?"); vals.push(data.recommended_interval_days); }
  if (sets.length > 0) {
    vals.push(id);
    await db.runAsync(`UPDATE service_types SET ${sets.join(", ")} WHERE id = ?`, vals);
  }
  // Replace custom fields if provided
  if (data.fields !== undefined) {
    await db.runAsync("DELETE FROM custom_fields WHERE service_type_id = ?", [id]);
    for (const field of data.fields) {
      await db.runAsync(
        "INSERT INTO custom_fields (service_type_id, name, field_type, unit) VALUES (?, ?, ?, ?)",
        [id, field.name, field.field_type, field.unit ?? null]
      );
    }
  }
  // Replace resets if provided
  if (data.resets !== undefined) {
    await db.runAsync("DELETE FROM service_type_resets WHERE parent_id = ?", [id]);
    for (const resetId of data.resets) {
      await db.runAsync("INSERT OR IGNORE INTO service_type_resets (parent_id, reset_id) VALUES (?, ?)", [id, resetId]);
    }
  }
  // Replace suggestions if provided
  if (data.suggestions !== undefined) {
    await db.runAsync("DELETE FROM service_type_suggestions WHERE parent_id = ?", [id]);
    for (const sugId of data.suggestions) {
      await db.runAsync("INSERT OR IGNORE INTO service_type_suggestions (parent_id, suggestion_id) VALUES (?, ?)", [id, sugId]);
    }
  }
  return (await getServiceTypeById(id))!;
}

export async function deleteServiceType(id: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM service_types WHERE id = ?", [id]);
}

export async function getCustomFieldsForServiceType(serviceTypeId: number): Promise<CustomFieldRead[]> {
  const db = await getDatabase();
  return db.getAllAsync<CustomFieldRead>(
    "SELECT id, name, field_type, unit FROM custom_fields WHERE service_type_id = ? ORDER BY sort_order ASC",
    [serviceTypeId]
  );
}

// ====================================================================
// MAINTENANCE LOG CRUD
// ====================================================================

export async function getLogsForVehicle(vehicleId: number, serviceTypeId?: number): Promise<MaintenanceLogRead[]> {
  const db = await getDatabase();
  let sql = "SELECT * FROM maintenance_logs WHERE vehicle_id = ?";
  const params: any[] = [vehicleId];
  if (serviceTypeId !== undefined) {
    sql += " AND service_type_id = ?";
    params.push(serviceTypeId);
  }
  sql += " ORDER BY date DESC, id DESC";
  const rows = await db.getAllAsync<any>(sql, params);
  const logs: MaintenanceLogRead[] = [];
  for (const row of rows) {
    logs.push(await buildMaintenanceLogRead(row));
  }
  return logs;
}

export async function getLogById(logId: number): Promise<MaintenanceLogRead | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>("SELECT * FROM maintenance_logs WHERE id = ?", [logId]);
  if (!row) return null;
  return buildMaintenanceLogRead(row);
}

export async function createMaintenanceLog(vehicleId: number, data: MaintenanceLogCreate): Promise<MaintenanceLogRead> {
  const db = await getDatabase();
  const result = await db.runAsync(
    "INSERT INTO maintenance_logs (vehicle_id, service_type_id, date, mileage, cost, notes) VALUES (?, ?, ?, ?, ?, ?)",
    [vehicleId, data.service_type_id ?? null, data.date, data.mileage, data.cost, data.notes ?? null]
  );
  const newId = result.lastInsertRowId;
  // Create custom field values
  for (const cfv of (data.custom_field_values ?? [])) {
    await db.runAsync(
      "INSERT INTO custom_field_values (log_id, field_id, value) VALUES (?, ?, ?)",
      [newId, cfv.field_id, cfv.value]
    );
  }
  return (await getLogById(newId))!;
}

export async function updateMaintenanceLog(logId: number, data: MaintenanceLogUpdate): Promise<MaintenanceLogRead> {
  const db = await getDatabase();
  const sets: string[] = [];
  const vals: any[] = [];
  if (data.date !== undefined) { sets.push("date = ?"); vals.push(data.date); }
  if (data.mileage !== undefined) { sets.push("mileage = ?"); vals.push(data.mileage); }
  if (data.cost !== undefined) { sets.push("cost = ?"); vals.push(data.cost); }
  if (data.notes !== undefined) { sets.push("notes = ?"); vals.push(data.notes); }
  if (data.service_type_id !== undefined) { sets.push("service_type_id = ?"); vals.push(data.service_type_id); }
  if (sets.length > 0) {
    vals.push(logId);
    await db.runAsync(`UPDATE maintenance_logs SET ${sets.join(", ")} WHERE id = ?`, vals);
  }
  // Replace custom field values if provided
  if (data.custom_field_values !== undefined) {
    await db.runAsync("DELETE FROM custom_field_values WHERE log_id = ?", [logId]);
    for (const cfv of data.custom_field_values) {
      await db.runAsync(
        "INSERT INTO custom_field_values (log_id, field_id, value) VALUES (?, ?, ?)",
        [logId, cfv.field_id, cfv.value]
      );
    }
  }
  return (await getLogById(logId))!;
}

export async function deleteMaintenanceLog(logId: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM maintenance_logs WHERE id = ?", [logId]);
}

// ====================================================================
// VEHICLE SERVICE INTERVAL OVERRIDES
// ====================================================================

export async function getOverridesForVehicle(vehicleId: number): Promise<VehicleServiceIntervalOverrideRead[]> {
  const db = await getDatabase();
  return db.getAllAsync<VehicleServiceIntervalOverrideRead>(
    "SELECT * FROM vehicle_service_interval_overrides WHERE vehicle_id = ?",
    [vehicleId]
  );
}

export async function upsertIntervalOverride(
  vehicleId: number, serviceTypeId: number, data: VehicleServiceIntervalOverrideCreate
): Promise<VehicleServiceIntervalOverrideRead> {
  const db = await getDatabase();
  await db.runAsync(
    `INSERT INTO vehicle_service_interval_overrides (vehicle_id, service_type_id, override_interval_km, override_interval_days)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(vehicle_id, service_type_id) DO UPDATE SET
       override_interval_km = excluded.override_interval_km,
       override_interval_days = excluded.override_interval_days`,
    [vehicleId, serviceTypeId, data.override_interval_km ?? null, data.override_interval_days ?? null]
  );
  const row = await db.getFirstAsync<VehicleServiceIntervalOverrideRead>(
    "SELECT * FROM vehicle_service_interval_overrides WHERE vehicle_id = ? AND service_type_id = ?",
    [vehicleId, serviceTypeId]
  );
  return row!;
}

export async function deleteIntervalOverride(vehicleId: number, serviceTypeId: number): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "DELETE FROM vehicle_service_interval_overrides WHERE vehicle_id = ? AND service_type_id = ?",
    [vehicleId, serviceTypeId]
  );
}

// ====================================================================
// SUMMARY QUERIES
// ====================================================================

export async function getMaintenanceSummary(vehicleId: number): Promise<MaintenanceSummary> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<any>(
    `SELECT
       COUNT(*) as total_logs,
       COALESCE(SUM(cost), 0) as total_cost,
       COALESCE(AVG(cost), 0) as average_cost,
       MAX(date) as last_service_date,
       MAX(mileage) as last_mileage
     FROM maintenance_logs WHERE vehicle_id = ?`,
    [vehicleId]
  );
  const daysSince = row?.last_service_date
    ? Math.floor((Date.now() - new Date(row.last_service_date).getTime()) / 86400000)
    : null;
  return {
    vehicle_id: vehicleId,
    total_logs: row?.total_logs ?? 0,
    total_cost: row?.total_cost ?? 0,
    average_cost: row?.average_cost ?? 0,
    last_service_date: row?.last_service_date ?? null,
    days_since_last_service: daysSince,
    last_mileage: row?.last_mileage ?? null,
  };
}

export async function getServiceTypeSummaries(vehicleId: number): Promise<ServiceTypeLogSummary[]> {
  const db = await getDatabase();
  return db.getAllAsync<ServiceTypeLogSummary>(
    `SELECT
       ml.service_type_id,
       st.name as service_type_name,
       COUNT(*) as log_count,
       MAX(ml.date) as last_log_date,
       MAX(ml.mileage) as last_log_mileage,
       COALESCE(SUM(ml.cost), 0) as total_cost_for_service_type
     FROM maintenance_logs ml
     JOIN service_types st ON ml.service_type_id = st.id
     WHERE ml.vehicle_id = ? AND ml.service_type_id IS NOT NULL
     GROUP BY ml.service_type_id
     ORDER BY last_log_date DESC`,
    [vehicleId]
  );
}

// ====================================================================
// HYDRATION HELPERS - Build full "Read" objects with nested relations
// ====================================================================

async function buildVehicleRead(row: any): Promise<VehicleRead> {
  const logs = await getLogsForVehicle(row.id);
  const overrides = await getOverridesForVehicle(row.id);
  return {
    id: row.id,
    make: row.make,
    model: row.model,
    year: row.year,
    vin: row.vin,
    initial_mileage: row.initial_mileage,
    acquisition_date: row.acquisition_date,
    maintenance_logs: logs,
    interval_overrides: overrides,
  };
}

async function buildServiceTypeRead(row: any): Promise<ServiceTypeRead> {
  const db = await getDatabase();
  const fields = await db.getAllAsync<CustomFieldRead>(
    "SELECT id, name, field_type, unit FROM custom_fields WHERE service_type_id = ? ORDER BY sort_order ASC",
    [row.id]
  );
  const resets = await db.getAllAsync<{ reset_id: number }>(
    "SELECT reset_id FROM service_type_resets WHERE parent_id = ?", [row.id]
  );
  const suggestions = await db.getAllAsync<{ suggestion_id: number }>(
    "SELECT suggestion_id FROM service_type_suggestions WHERE parent_id = ?", [row.id]
  );
  return {
    id: row.id,
    name: row.name,
    recommended_interval_km: row.recommended_interval_km,
    recommended_interval_days: row.recommended_interval_days,
    fields,
    resets: resets.map(r => r.reset_id),
    suggestions: suggestions.map(s => s.suggestion_id),
  };
}

async function buildMaintenanceLogRead(row: any): Promise<MaintenanceLogRead> {
  const db = await getDatabase();
  const serviceType = row.service_type_id
    ? await getServiceTypeById(row.service_type_id)
    : null;
  const cfvRows = await db.getAllAsync<any>(
    `SELECT cfv.id, cfv.field_id, cfv.value, cf.id as cf_id, cf.name as cf_name, cf.field_type as cf_field_type, cf.unit as cf_unit
     FROM custom_field_values cfv
     JOIN custom_fields cf ON cfv.field_id = cf.id
     WHERE cfv.log_id = ?`,
    [row.id]
  );
  const customFieldValues: CustomFieldValueRead[] = cfvRows.map((cfv: any) => ({
    id: cfv.id,
    field_id: cfv.field_id,
    value: cfv.value,
    custom_field: {
      id: cfv.cf_id,
      name: cfv.cf_name,
      field_type: cfv.cf_field_type,
      unit: cfv.cf_unit,
    },
  }));
  return {
    id: row.id,
    vehicle_id: row.vehicle_id,
    service_type_id: row.service_type_id,
    date: row.date,
    mileage: row.mileage,
    cost: row.cost,
    notes: row.notes,
    service_type: serviceType,
    custom_field_values: customFieldValues,
  };
}

// ====================================================================
// APP SETTINGS / PREFERENCES
// ====================================================================

export async function getSetting(key: string): Promise<string | null> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM app_settings WHERE key = ?",
    [key]
  );
  return row ? row.value : null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync(
    "INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)",
    [key, value]
  );
}

export async function removeSetting(key: string): Promise<void> {
  const db = await getDatabase();
  await db.runAsync("DELETE FROM app_settings WHERE key = ?", [key]);
}
