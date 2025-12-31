// ====================================================================
// CORE API TYPES - These directly mirror the backend Pydantic schemas
// ====================================================================

// ----------------------------------------
// Custom Fields
// ----------------------------------------

/** Base properties for creating a custom field. Mirrors `CustomFieldCreate`. */
export interface CustomFieldCreate {
  name: string;
  field_type: "text" | "number" | "date" | "boolean";
  unit?: string;
}

/** A custom field as returned by the API. Mirrors `CustomFieldRead`. */
export interface CustomFieldRead extends CustomFieldCreate {
  id: number;
}

// ----------------------------------------
// Service Types
// ----------------------------------------

/** Base properties for a service type. */
export interface ServiceTypeBase {
  name: string;
  recommended_interval_km?: number | null;
  recommended_interval_days?: number | null;
}

/** Data needed to create a new service type. Mirrors `ServiceTypeCreate`. */
export interface ServiceTypeCreate extends ServiceTypeBase {
  fields: CustomFieldCreate[];
}

/** A service type as returned by the API. Mirrors `ServiceTypeRead`. */
export interface ServiceTypeRead extends ServiceTypeBase {
  id: number;
  fields: CustomFieldRead[];
}

/** Data needed to update a service type. Mirrors `ServiceTypeUpdate`. */
export interface ServiceTypeUpdate {
  name?: string;
  recommended_interval_km?: number | null;
  recommended_interval_days?: number | null;
  fields?: CustomFieldCreate[];
}

// ----------------------------------------
// Custom Field Values
// ----------------------------------------

/** Data needed to create a value for a custom field. Mirrors `CustomFieldValueCreate`. */
export interface CustomFieldValueCreate {
  field_id: number;
  value: string;
}

/** A custom field value as returned by the API. Mirrors `CustomFieldValueRead`. */
export interface CustomFieldValueRead extends CustomFieldValueCreate {
  id: number;
  custom_field: CustomFieldRead;
}

// ----------------------------------------
// Maintenance Logs
// ----------------------------------------

/** Base properties for a maintenance log. */
export interface MaintenanceLogBase {
  date: string; // ISO format: "YYYY-MM-DD"
  mileage: number;
  cost: number;
  notes?: string | null;
  service_type_id?: number | null; // Can be null if service type is deleted
}

/** Data needed to create a new maintenance log. Mirrors `MaintenanceLogCreate`. */
export interface MaintenanceLogCreate extends MaintenanceLogBase {
  custom_field_values?: CustomFieldValueCreate[];
}

/** A maintenance log as returned by the API. Mirrors `MaintenanceLogRead`. */
export interface MaintenanceLogRead extends MaintenanceLogBase {
  id: number;
  vehicle_id: number;
  service_type: ServiceTypeRead | null; // Can be null
  custom_field_values: CustomFieldValueRead[];
}

/** Data needed to update a maintenance log. Mirrors `MaintenanceLogUpdate`. */
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

/** Base properties for a vehicle-specific service interval. */
export interface VehicleServiceIntervalOverrideBase {
  override_interval_km?: number | null;
  override_interval_days?: number | null;
}

/** Data needed to create/update an override. Mirrors `VehicleServiceIntervalOverrideCreate/Update`. */
export interface VehicleServiceIntervalOverrideCreate extends VehicleServiceIntervalOverrideBase {}

/** An interval override as returned by the API. Mirrors `VehicleServiceIntervalOverrideRead`. */
export interface VehicleServiceIntervalOverrideRead extends VehicleServiceIntervalOverrideBase {
  id: number;
  vehicle_id: number;
  service_type_id: number;
}

// ----------------------------------------
// Vehicles
// ----------------------------------------

/** Base properties for a vehicle. */
export interface VehicleBase {
  make: string;
  model: string;
  year?: number | null;
  vin?: string | null;
  initial_mileage?: number | null;
  acquisition_date?: string | null; // ISO format: "YYYY-MM-DD"
}

/** Data needed to create a new vehicle. Mirrors `VehicleCreate`. */
export interface VehicleCreate extends VehicleBase {}

/** Data needed to update a vehicle. Mirrors `VehicleUpdate`. */
export interface VehicleUpdate extends Partial<VehicleBase> {}

/** A vehicle as returned by the API, including nested data. Mirrors `VehicleRead`. */
export interface VehicleRead extends VehicleBase {
  id: number;
  maintenance_logs: MaintenanceLogRead[];
  interval_overrides: VehicleServiceIntervalOverrideRead[]; // This was missing
}

// ====================================================================
// DERIVED & CLIENT-SIDE TYPES - These are used for UI state, etc.
// ====================================================================

/** Summary statistics for a vehicle. Mirrors `MaintenanceSummary`. */
export interface MaintenanceSummary {
  vehicle_id: number;
  total_logs: number;
  total_cost: number;
  average_cost: number;
  last_service_date?: string | null;
  days_since_last_service?: number | null;
  last_mileage?: number | null;
}

/** Log summary grouped by service type. Mirrors `ServiceTypeLogSummary`. */
export interface ServiceTypeLogSummary {
  service_type_id: number;
  service_type_name: string;
  log_count: number;
  last_log_date?: string | null;
  last_log_mileage?: number | null;
  total_cost_for_service_type: number;
}

/** Represents the calculated status of a single upcoming maintenance item. */
export interface UpcomingMaintenanceItemData {
  serviceTypeId: number;
  serviceTypeName: string;
  status: "Overdue" | "Upcoming" | "OK" | "NoInterval" | "NeverDone";
  message: string;
  details?: {
    byDate?: {
      due: string;
      remainingDays: number;
    };
    byMileage?: {
      due: number;
      remainingKm: number;
    };
    lastPerformed?: {
      date?: string | null;
      mileage?: number | null;
    };
  };
}

// ====================================================================
// BACKUP & RESTORE API TYPES
// ====================================================================

/** Configuration for an export request. Mirrors `BackupConfiguration`. */
export interface BackupConfiguration {
  vehicle_ids?: number[];
  start_date?: string;
  end_date?: string;
  include_maintenance_logs?: boolean;
}

/** The structure of the final backup JSON file. Mirrors `FullBackupData`. */
export interface FullBackupData {
  metadata: {
    export_date_utc: string;
    config_used: BackupConfiguration;
  };
  service_types: ServiceTypeRead[];
  vehicles: VehicleRead[];
}

/** The response from the analysis endpoint. Mirrors `BackupAnalysisResponse`. */
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
    backup_vehicle: any; // Define if needed
    existing_vehicle_id: number;
  }[];
}

/** The restore plan sent to the execution endpoint. Mirrors `RestorePlan`. */
export interface RestorePlan {
  vehicles_to_add: number[];
  conflict_resolutions: {
    vin: string;
    action: "skip" | "replace";
  }[];
}

/** A generic API error response from FastAPI. */
export interface ErrorResponse {
  detail: string | { loc: (string | number)[]; msg: string }[];
}