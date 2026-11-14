// The tables that sync between devices, in an order where every table's references come
// before it, with their primary-key columns.

export interface SyncedTable {
  name: string;
  primaryKey: readonly string[];
}

export const SYNCED_TABLE_INFO = [
  { name: "vehicles", primaryKey: ["id"] },
  { name: "odometer_readings", primaryKey: ["id"] },
  { name: "service_events", primaryKey: ["id"] },
  { name: "service_types", primaryKey: ["id"] },
  { name: "custom_fields", primaryKey: ["id"] },
  { name: "maintenance_logs", primaryKey: ["id"] },
  { name: "custom_field_values", primaryKey: ["id"] },
  { name: "vehicle_service_interval_overrides", primaryKey: ["id"] },
  { name: "service_type_resets", primaryKey: ["parent_id", "reset_id"] },
  { name: "service_type_suggestions", primaryKey: ["parent_id", "suggestion_id"] },
  { name: "preferences", primaryKey: ["key"] },
] as const satisfies readonly SyncedTable[];

/** Tables that carry sync columns (updated_at, deleted_at, device_id). */
export const SYNCED_TABLES = SYNCED_TABLE_INFO.map((t) => t.name);

export type SyncedTableName = (typeof SYNCED_TABLE_INFO)[number]["name"];
