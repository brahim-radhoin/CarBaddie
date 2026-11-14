// ====================================================================
// CORE DATA TYPES - shared by the desktop and mobile apps. Ids are UUIDs (see ids/uuid.ts).
// ====================================================================

import type { BackupFile } from "./backup/format";

/** A row id: UUIDv7 for user-created rows, UUIDv5 for built-in service types and overrides. */
export type Id = string;

// ----------------------------------------
// Custom Fields
// ----------------------------------------

/** A custom field definition as submitted from a service type form. */
export interface CustomFieldCreate {
  /** Set when editing an existing field so it is updated in place instead of replaced. */
  id?: Id;
  name: string;
  field_type: "text" | "number" | "date" | "boolean";
  unit?: string;
}

export interface CustomFieldRead {
  id: Id;
  name: string;
  field_type: CustomFieldCreate["field_type"];
  unit?: string | null;
  /**
   * The field was removed from its service type. Archived fields are never deleted, so values
   * recorded with them keep their definition. Only present on export and on log values.
   */
  archived?: boolean;
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
  resets?: Id[];
  suggestions?: Id[];
}

export interface ServiceTypeRead extends ServiceTypeBase {
  id: Id;
  /** Stable key of a built-in service type (see service-types/builtin.ts); null for custom ones. */
  slug: string | null;
  /** Active fields only. */
  fields: CustomFieldRead[];
  resets: Id[];
  suggestions: Id[];
}

export interface ServiceTypeUpdate {
  name?: string;
  recommended_interval_km?: number | null;
  recommended_interval_days?: number | null;
  /**
   * The complete new field list. Fields matched by `id` (or, failing that, by name) are kept;
   * existing fields left out are archived, never deleted.
   */
  fields?: CustomFieldCreate[];
  resets?: Id[];
  suggestions?: Id[];
}

// ----------------------------------------
// Custom Field Values
// ----------------------------------------

export interface CustomFieldValueCreate {
  field_id: Id;
  value: string;
}

export interface CustomFieldValueRead extends CustomFieldValueCreate {
  id: Id;
  custom_field: CustomFieldRead;
}

// ----------------------------------------
// Maintenance Logs
// ----------------------------------------

export interface MaintenanceLogBase {
  date: string; // ISO format: "YYYY-MM-DD"
  mileage: number; // km
  /** Hundredths of the currency unit (see Preferences.currency). */
  cost_cents: number;
  notes?: string | null;
  service_type_id?: Id | null; // Null if the service type was deleted
}

export interface MaintenanceLogCreate extends MaintenanceLogBase {
  custom_field_values?: CustomFieldValueCreate[];
}

export interface MaintenanceLogRead extends MaintenanceLogBase {
  id: Id;
  vehicle_id: Id;
  /** The garage visit this log is an item of; null for a log that is a visit of its own. */
  event_id: Id | null;
  service_type: ServiceTypeRead | null;
  custom_field_values: CustomFieldValueRead[];
}

export interface MaintenanceLogUpdate {
  date?: string;
  mileage?: number;
  cost_cents?: number;
  notes?: string | null;
  service_type_id?: Id | null;
  /**
   * Values for the log's current fields. Values recorded against archived fields are kept
   * even when not listed here.
   */
  custom_field_values?: CustomFieldValueCreate[];
}

// ----------------------------------------
// Service Events (garage visits)
// ----------------------------------------

/**
 * One service done during a visit. It is stored as a maintenance log, so the due-date engine
 * sees it like any other log; its date and mileage are the visit's.
 */
export interface ServiceItemCreate {
  service_type_id: Id | null;
  /** Hundredths of the currency unit. */
  cost_cents: number;
  notes?: string | null;
  custom_field_values?: CustomFieldValueCreate[];
}

export interface ServiceItemUpdate extends ServiceItemCreate {
  /** An existing item of the visit, updated in place. Without it the item is added. */
  id?: Id;
}

export interface ServiceEventCreate {
  date: string; // ISO format: "YYYY-MM-DD"
  mileage: number; // km
  shop?: string | null;
  notes?: string | null;
  items: ServiceItemCreate[];
}

export interface ServiceEventUpdate {
  date?: string;
  mileage?: number;
  shop?: string | null;
  notes?: string | null;
  /** The complete new item list: items matched by `id` are updated, others added, existing ones left out deleted. */
  items?: ServiceItemUpdate[];
}

export interface ServiceEventRead {
  /** The visit's id, or for a standalone visit the id of its only log. */
  id: Id;
  vehicle_id: Id;
  date: string;
  mileage: number;
  shop: string | null;
  notes: string | null;
  total_cost_cents: number;
  items: MaintenanceLogRead[];
  /** A log recorded on its own (no service event); `id` is the log's id. */
  standalone?: boolean;
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
  id: Id;
  vehicle_id: Id;
  service_type_id: Id;
}

// ----------------------------------------
// Odometer Readings
// ----------------------------------------

/** A mileage noted between services, so the current mileage is known without a log. */
export interface OdometerReadingCreate {
  date: string; // ISO format: "YYYY-MM-DD"
  mileage: number; // km
  note?: string | null;
}

export interface OdometerReadingRead {
  id: Id;
  vehicle_id: Id;
  date: string;
  mileage: number;
  note: string | null;
}

export interface OdometerReadingUpdate extends Partial<OdometerReadingCreate> {}

// ----------------------------------------
// Vehicles
// ----------------------------------------

export interface VehicleBase {
  make: string;
  model: string;
  year?: number | null;
  vin?: string | null;
  initial_mileage?: number | null;
  acquisition_date?: string | null; // ISO format: "YYYY-MM-DD"
}

export interface VehicleCreate extends VehicleBase {}

export interface VehicleUpdate extends Partial<VehicleBase> {}

export interface VehicleRead extends VehicleBase {
  id: Id;
  maintenance_logs: MaintenanceLogRead[];
  interval_overrides: VehicleServiceIntervalOverrideRead[];
  /** Newest first (by date, then mileage). */
  odometer_readings: OdometerReadingRead[];
  /**
   * The highest known mileage in km: initial mileage, logs and odometer readings.
   * Null when none is known.
   */
  current_mileage: number | null;
}

// ====================================================================
// DERIVED & CLIENT-SIDE TYPES
// ====================================================================

export interface MaintenanceSummary {
  vehicle_id: Id;
  total_logs: number;
  total_cost_cents: number;
  average_cost_cents: number;
  last_service_date?: string | null;
  days_since_last_service?: number | null;
  last_mileage?: number | null;
}

export interface ServiceTypeLogSummary {
  service_type_id: Id;
  service_type_name: string;
  log_count: number;
  last_log_date?: string | null;
  last_log_mileage?: number | null;
  total_cost_cents: number;
}

/** The calculated status of a single upcoming maintenance item. */
export interface UpcomingMaintenanceItemData<TId extends string | number = Id> {
  serviceTypeId: TId;
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
// BACKUP & RESTORE
// ====================================================================

export interface BackupConfiguration {
  vehicle_ids?: Id[];
  start_date?: string;
  end_date?: string;
  include_maintenance_logs?: boolean;
}

/** A parsed backup file. Ids inside it are file-local integers (see backup/format.ts). */
export type FullBackupData = BackupFile;

export interface BackupVehicleInfo {
  /** The vehicle's id within the backup file. */
  id_in_backup: number;
  make: string;
  model: string;
  year?: number | null;
  vin?: string | null;
  log_count: number;
}

export interface BackupAnalysisResponse {
  new_vehicles: BackupVehicleInfo[];
  conflicting_vehicles: {
    vin: string;
    backup_vehicle: {
      make: string;
      model: string;
      year?: number | null;
      vin?: string | null;
    };
    existing_vehicle_id: Id;
  }[];
  /** VIN-less vehicles matching a local one (make/model/year); not imported. */
  skipped_duplicates?: BackupVehicleInfo[];
}

export interface RestorePlan {
  /** File-local ids of the backup vehicles to add. */
  vehicles_to_add: number[];
  conflict_resolutions: {
    vin: string;
    action: "skip" | "replace";
  }[];
}

// ----------------------------------------
// Preferences (synced between devices)
// ----------------------------------------

export type DistanceUnit = "km" | "mi";

export interface Preferences {
  /** ISO 4217 code, e.g. "EUR". */
  currency: string;
  /** How distances are shown and typed; they are always stored in km. */
  distance_unit: DistanceUnit;
}
