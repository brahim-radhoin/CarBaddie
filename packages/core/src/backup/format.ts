// The JSON backup file (manual export/restore and the current Google Drive snapshot).
//
// Ids inside the file are small integers that are only meaningful within the file: they
// link logs to service types, values to fields, and so on. Importers always create fresh
// local ids. The integer format is the one older desktop (Python backend) and mobile versions
// wrote and read, so files stay interchangeable with them.
//
// Parsing is lenient on purpose: it accepts files written by older desktop and mobile
// versions (string numbers, `resets` as objects, unknown field types) and normalises them.

import { z } from "zod";
import type {
  BackupConfiguration,
  CustomFieldRead,
  Id,
  ServiceTypeRead,
  VehicleRead,
} from "../types";

const fileId = z.number().int();
/** `resets`/`suggestions` were written as ids by some versions and as objects by others. */
const idRef = z.union([fileId, z.object({ id: fileId }).transform((o) => o.id)]);
const optionalInt = z.number().int().nullish().transform((v) => v ?? null);
const optionalString = z.string().nullish().transform((v) => v ?? null);
const lenientNumber = z.coerce.number().catch(0).transform((n) => (Number.isFinite(n) ? n : 0));

const fieldTypeSchema = z.enum(["text", "number", "date", "boolean"]).catch("text");

const backupFieldSchema = z.object({
  id: fileId,
  name: z.string(),
  field_type: fieldTypeSchema,
  unit: optionalString,
  /** Field removed from its service type; kept so old values still have a definition. */
  archived: z.boolean().optional(),
});

const backupServiceTypeSchema = z.object({
  id: fileId,
  name: z.string(),
  recommended_interval_km: optionalInt,
  recommended_interval_days: optionalInt,
  fields: z.array(backupFieldSchema).default([]),
  resets: z.array(idRef).default([]),
  suggestions: z.array(idRef).default([]),
});

const backupFieldValueSchema = z
  .object({
    id: fileId.optional(),
    field_id: fileId.optional(),
    custom_field: backupFieldSchema.partial().extend({ id: fileId }).optional(),
    value: z.unknown(),
  })
  .transform((v, ctx) => {
    const fieldId = v.field_id ?? v.custom_field?.id;
    if (fieldId === undefined) {
      ctx.addIssue({ code: "custom", message: "Custom field value has no field_id" });
      return z.NEVER;
    }
    return {
      id: v.id,
      field_id: fieldId,
      custom_field: v.custom_field,
      value: v.value === undefined || v.value === null ? "" : String(v.value),
    };
  });

const backupLogSchema = z.object({
  id: fileId.optional(),
  vehicle_id: fileId.optional(),
  date: optionalString,
  mileage: lenientNumber.transform(Math.trunc),
  cost: lenientNumber,
  notes: optionalString,
  service_type_id: optionalInt,
  custom_field_values: z.array(backupFieldValueSchema).default([]),
});

const backupOverrideSchema = z.object({
  id: fileId.optional(),
  vehicle_id: fileId.optional(),
  service_type_id: fileId,
  override_interval_km: optionalInt,
  override_interval_days: optionalInt,
});

const backupVehicleSchema = z.object({
  id: fileId,
  make: z.string(),
  model: z.string(),
  year: optionalInt,
  vin: z
    .string()
    .nullish()
    .transform((v) => (v && v.trim() ? v.trim() : null)),
  initial_mileage: optionalInt,
  acquisition_date: optionalString,
  maintenance_logs: z.array(backupLogSchema).default([]),
  interval_overrides: z.array(backupOverrideSchema).default([]),
});

const backupConfigSchema = z.object({
  vehicle_ids: z.array(fileId).nullish(),
  start_date: z.string().nullish(),
  end_date: z.string().nullish(),
  include_maintenance_logs: z.boolean().optional(),
});

export const backupFileSchema = z.object({
  metadata: z.object({
    export_date_utc: z.string(),
    config_used: backupConfigSchema.catch({}),
  }),
  service_types: z.array(backupServiceTypeSchema),
  vehicles: z.array(backupVehicleSchema),
});

export type BackupFile = z.output<typeof backupFileSchema>;

/** Validates and normalises a parsed backup file. Throws with a readable message if invalid. */
export function parseBackup(json: unknown): BackupFile {
  const result = backupFileSchema.safeParse(json);
  if (!result.success) {
    const first = result.error.issues[0];
    const where = first?.path.length ? ` at ${first.path.join(".")}` : "";
    throw new Error(`Invalid backup file${where}: ${first?.message ?? "unknown error"}`);
  }
  return result.data;
}

export interface EncodeBackupInput {
  /** Every service type, with archived fields included (`archived: true`). */
  serviceTypes: ServiceTypeRead[];
  /** The vehicles to include, already filtered by the export configuration. */
  vehicles: VehicleRead[];
  config: BackupConfiguration;
  exportedAt: Date;
}

/** Builds a backup file from local data, replacing UUIDs with file-local integer ids. */
export function encodeBackup({ serviceTypes, vehicles, config, exportedAt }: EncodeBackupInput): BackupFile {
  const counters = new Map<string, number>();
  const maps = new Map<string, Map<Id, number>>();
  const fileIdFor = (kind: string, id: Id): number => {
    let map = maps.get(kind);
    if (!map) maps.set(kind, (map = new Map()));
    let n = map.get(id);
    if (n === undefined) {
      n = (counters.get(kind) ?? 0) + 1;
      counters.set(kind, n);
      map.set(id, n);
    }
    return n;
  };
  const encodeField = (f: CustomFieldRead) => ({
    id: fileIdFor("field", f.id),
    name: f.name,
    field_type: f.field_type,
    unit: f.unit ?? null,
    ...(f.archived ? { archived: true } : {}),
  });

  const knownServiceTypes = new Set(serviceTypes.map((st) => st.id));
  const encodedServiceTypes = serviceTypes.map((st) => ({
    id: fileIdFor("serviceType", st.id),
    name: st.name,
    recommended_interval_km: st.recommended_interval_km ?? null,
    recommended_interval_days: st.recommended_interval_days ?? null,
    fields: st.fields.map(encodeField),
    resets: st.resets.filter((id) => knownServiceTypes.has(id)).map((id) => fileIdFor("serviceType", id)),
    suggestions: st.suggestions.filter((id) => knownServiceTypes.has(id)).map((id) => fileIdFor("serviceType", id)),
  }));

  const encodedVehicles = vehicles.map((v) => {
    const vehicleFileId = fileIdFor("vehicle", v.id);
    return {
      id: vehicleFileId,
      make: v.make,
      model: v.model,
      year: v.year ?? null,
      vin: v.vin?.trim() ? v.vin.trim() : null,
      initial_mileage: v.initial_mileage ?? null,
      acquisition_date: v.acquisition_date ?? null,
      maintenance_logs: v.maintenance_logs.map((log) => ({
        id: fileIdFor("log", log.id),
        vehicle_id: vehicleFileId,
        date: log.date,
        mileage: log.mileage,
        cost: log.cost,
        notes: log.notes ?? null,
        service_type_id:
          log.service_type_id && knownServiceTypes.has(log.service_type_id)
            ? fileIdFor("serviceType", log.service_type_id)
            : null,
        custom_field_values: log.custom_field_values.map((cfv) => ({
          id: fileIdFor("value", cfv.id),
          field_id: fileIdFor("field", cfv.field_id),
          custom_field: encodeField(cfv.custom_field),
          value: cfv.value,
        })),
      })),
      interval_overrides: v.interval_overrides
        .filter((ov) => knownServiceTypes.has(ov.service_type_id))
        .map((ov) => ({
          id: fileIdFor("override", ov.id),
          vehicle_id: vehicleFileId,
          service_type_id: fileIdFor("serviceType", ov.service_type_id),
          override_interval_km: ov.override_interval_km ?? null,
          override_interval_days: ov.override_interval_days ?? null,
        })),
    };
  });

  return {
    metadata: {
      export_date_utc: exportedAt.toISOString(),
      config_used: {
        vehicle_ids: config.vehicle_ids?.length ? encodedVehicles.map((v) => v.id) : null,
        start_date: config.start_date ?? null,
        end_date: config.end_date ?? null,
        include_maintenance_logs: config.include_maintenance_logs ?? true,
      },
    },
    service_types: encodedServiceTypes,
    vehicles: encodedVehicles,
  };
}
