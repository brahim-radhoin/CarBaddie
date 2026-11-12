// ====================================================================
// CORE API TYPES - Shared between PC (Tauri) and Mobile (Expo)
// These must stay in sync to ensure backup/restore compatibility.
// ====================================================================

// ----------------------------------------
// Custom Fields
// ----------------------------------------

export interface CustomFieldCreate {
  name: string;
  field_type: "text" | "number" | "date" | "boolean";
  unit?: string;
}

export interface CustomFieldRead extends CustomFieldCreate {
  id: number;
}

// ----------------------------------------
// Service Types
// ----------------------------------------

export interface ServiceTypeBase {
  name: string;
  recommended_interval_km?: number | null;
  recommended_interval_days?: number | null;
}

export interface ServiceTypeCreate extends ServiceTypeBase {
  fields: CustomFieldCreate[];
  resets?: number[];
  suggestions?: number[];
}

export interface ServiceTypeRead extends ServiceTypeBase {
  id: number;
  fields: CustomFieldRead[];
  resets: number[];
  suggestions: number[];
}

export interface ServiceTypeUpdate {
  name?: string;
  recommended_interval_km?: number | null;
  recommended_interval_days?: number | null;
  fields?: CustomFieldCreate[];
  resets?: number[];
  suggestions?: number[];
}

// ----------------------------------------
// Custom Field Values
// ----------------------------------------

export interface CustomFieldValueCreate {
  field_id: number;
  value: string;
}

export interface CustomFieldValueRead extends CustomFieldValueCreate {
  id: number;
  custom_field: CustomFieldRead;
}

// ----------------------------------------
// Maintenance Logs
// ----------------------------------------

export interface MaintenanceLogBase {
  date: string;
  mileage: number;
  cost: number;
  notes?: string | null;
  service_type_id?: number | null;
}

export interface MaintenanceLogCreate extends MaintenanceLogBase {
  custom_field_values?: CustomFieldValueCreate[];
}

export interface MaintenanceLogRead extends MaintenanceLogBase {
  id: number;
  vehicle_id: number;
  service_type: ServiceTypeRead | null;
  custom_field_values: CustomFieldValueRead[];
}

export interface MaintenanceLogUpdate {
  date?: string;
  mileage?: number;
  cost?: number;
  notes?: string | null;
  service_type_id?: number | null;
  custom_field_values?: CustomFieldValueCreate[];
}

// ----------------------------------------
// Vehicle Interval Overrides
// ----------------------------------------

export interface VehicleServiceIntervalOverrideBase {
  override_interval_km?: number | null;
  override_interval_days?: number | null;
}

export interface VehicleServiceIntervalOverrideCreate extends VehicleServiceIntervalOverrideBase {}

export interface VehicleServiceIntervalOverrideRead extends VehicleServiceIntervalOverrideBase {
  id: number;
  vehicle_id: number;
  service_type_id: number;
}

// ----------------------------------------
// Vehicles
// ----------------------------------------

export interface VehicleBase {
  make: string;
  model: string;
  year?: number | null;
  vin?: string | null;
  initial_mileage?: number | null;
  acquisition_date?: string | null;
}

export interface VehicleCreate extends VehicleBase {}
export interface VehicleUpdate extends Partial<VehicleBase> {}

export interface VehicleRead extends VehicleBase {
  id: number;
  maintenance_logs: MaintenanceLogRead[];
  interval_overrides: VehicleServiceIntervalOverrideRead[];
}

// ====================================================================
// DERIVED & CLIENT-SIDE TYPES
// ====================================================================

export interface MaintenanceSummary {
  vehicle_id: number;
  total_logs: number;
  total_cost: number;
  average_cost: number;
  last_service_date?: string | null;
  days_since_last_service?: number | null;
  last_mileage?: number | null;
}

export interface ServiceTypeLogSummary {
  service_type_id: number;
  service_type_name: string;
  log_count: number;
  last_log_date?: string | null;
  last_log_mileage?: number | null;
  total_cost_for_service_type: number;
}

export interface UpcomingMaintenanceItemData {
  serviceTypeId: number;
  serviceTypeName: string;
  status: "Overdue" | "Upcoming" | "OK" | "NoInterval" | "NeverDone";
  message: string;
  details?: {
    byDate?: { due: string; remainingDays: number };
    byMileage?: { due: number; remainingKm: number };
    lastPerformed?: { date?: string | null; mileage?: number | null };
  };
}

// ====================================================================
// BACKUP & RESTORE TYPES - Must match PC app exactly
// ====================================================================

export interface BackupConfiguration {
  vehicle_ids?: number[];
  start_date?: string;
  end_date?: string;
  include_maintenance_logs?: boolean;
}

export interface FullBackupData {
  metadata: {
    export_date_utc: string;
    config_used: BackupConfiguration;
  };
  service_types: ServiceTypeRead[];
  vehicles: VehicleRead[];
}

export interface BackupAnalysisResponse {
  new_vehicles: {
    id_in_backup: number;
    make: string;
    model: string;
    year?: number | null;
    vin?: string | null;
    log_count: number;
  }[];
  conflicting_vehicles: {
    vin: string;
    backup_vehicle: {
      make: string;
      model: string;
      year?: number | null;
      vin?: string | null;
    };
    existing_vehicle_id: number;
  }[];
  /** VIN-less vehicles matching a local one (make/model/year); not imported. */
  skipped_duplicates?: BackupAnalysisResponse["new_vehicles"];
}

export interface RestorePlan {
  vehicles_to_add: number[];
  conflict_resolutions: {
    vin: string;
    action: "skip" | "replace";
  }[];
}
