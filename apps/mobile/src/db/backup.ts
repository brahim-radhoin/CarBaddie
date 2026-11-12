import type { SQLiteDatabase } from "expo-sqlite";
import { getDatabase } from "./schema";
import * as repo from "./repository";
import type {
  FullBackupData, BackupConfiguration, BackupAnalysisResponse, RestorePlan,
} from "../types";

// ====================================================================
// EXPORT — Produces the same FullBackupData JSON as the PC app
// ====================================================================

export async function exportBackupData(config: BackupConfiguration): Promise<FullBackupData> {
  const allServiceTypes = await repo.getAllServiceTypes();
  let vehicles = await repo.getAllVehicles();

  // Filter by vehicle IDs if specified
  if (config.vehicle_ids && config.vehicle_ids.length > 0) {
    vehicles = vehicles.filter(v => config.vehicle_ids!.includes(v.id));
  }

  // Filter logs by date range if specified
  if (config.start_date || config.end_date) {
    vehicles = vehicles.map(v => ({
      ...v,
      maintenance_logs: (v.maintenance_logs ?? []).filter(log => {
        if (config.start_date && log.date < config.start_date) return false;
        if (config.end_date && log.date > config.end_date) return false;
        return true;
      }),
    }));
  }

  // Strip logs if not included
  if (config.include_maintenance_logs === false) {
    vehicles = vehicles.map(v => ({ ...v, maintenance_logs: [] }));
  }

  return {
    metadata: {
      export_date_utc: new Date().toISOString(),
      config_used: config,
    },
    service_types: allServiceTypes,
    vehicles,
  };
}

// ====================================================================
// ANALYZE — Compares backup data against current DB
// ====================================================================

export async function analyzeBackup(backupData: FullBackupData): Promise<BackupAnalysisResponse> {
  const db = await getDatabase();
  const existingVins = await db.getAllAsync<{ vin: string; id: number }>(
    "SELECT vin, id FROM vehicles WHERE vin IS NOT NULL"
  );
  const vinMap = new Map(existingVins.map(v => [v.vin, v.id]));

  // Vehicles without a VIN have no stable identity across devices. Treat a backup vehicle
  // without a VIN as already present when a local VIN-less vehicle has the same
  // make/model/year, so repeated restores and Drive syncs don't duplicate it.
  const vehicleKey = (make?: string | null, model?: string | null, year?: number | null) =>
    `${(make ?? "").trim().toLowerCase()}|${(model ?? "").trim().toLowerCase()}|${year ?? ""}`;
  const noVinRows = await db.getAllAsync<{ make: string; model: string; year: number | null }>(
    "SELECT make, model, year FROM vehicles WHERE vin IS NULL OR TRIM(vin) = ''"
  );
  const existingNoVinKeys = new Set(noVinRows.map(r => vehicleKey(r.make, r.model, r.year)));
  const skippedDuplicates: BackupAnalysisResponse["new_vehicles"] = [];

  const newVehicles: BackupAnalysisResponse["new_vehicles"] = [];
  const conflictingVehicles: BackupAnalysisResponse["conflicting_vehicles"] = [];

  for (const v of (backupData.vehicles ?? [])) {
    const info = {
      id_in_backup: v.id,
      make: v.make,
      model: v.model,
      year: v.year,
      vin: v.vin,
      log_count: (v.maintenance_logs ?? []).length,
    };

    if (v.vin && vinMap.has(v.vin)) {
      conflictingVehicles.push({
        vin: v.vin,
        backup_vehicle: { make: v.make, model: v.model, year: v.year, vin: v.vin },
        existing_vehicle_id: vinMap.get(v.vin)!,
      });
    } else if (!v.vin && existingNoVinKeys.has(vehicleKey(v.make, v.model, v.year))) {
      skippedDuplicates.push(info);
    } else {
      newVehicles.push(info);
    }
  }

  return { new_vehicles: newVehicles, conflicting_vehicles: conflictingVehicles, skipped_duplicates: skippedDuplicates };
}

// ====================================================================
// EXECUTE IMPORT — Mirrors PC backend crud/backup.py
// ====================================================================

export async function executeImport(backupData: FullBackupData, plan: RestorePlan): Promise<void> {
  const db = await getDatabase();
  // One transaction: "replace" deletes the local vehicle before re-inserting it, so a
  // failure halfway must roll back instead of leaving the vehicle deleted.
  await db.withTransactionAsync(() => executeImportInTransaction(db, backupData, plan));
}

async function executeImportInTransaction(db: SQLiteDatabase, backupData: FullBackupData, plan: RestorePlan): Promise<void> {

  // --- Step 1: Handle Replacements (delete existing vehicles being replaced) ---
  const vinsToReplace = new Set(
    (plan.conflict_resolutions ?? []).filter(r => r.action === "replace").map(r => r.vin)
  );
  if (vinsToReplace.size > 0) {
    for (const vin of vinsToReplace) {
      await db.runAsync("DELETE FROM vehicles WHERE vin = ?", [vin]);
    }
  }

  // --- Step 2: Assemble vehicles to create ---
  const vehiclesToAddSet = new Set(plan.vehicles_to_add ?? []);
  const vehiclesToCreate = (backupData.vehicles ?? []).filter(
    v => vehiclesToAddSet.has(v.id) || (v.vin && vinsToReplace.has(v.vin))
  );

  if (vehiclesToCreate.length === 0 && (!backupData.service_types || backupData.service_types.length === 0)) {
    return;
  }

  // --- Step 3: Map old service type IDs to new ones ---
  const oldToNewServiceTypeMap = new Map<number, number>();
  const oldToNewFieldMap = new Map<number, number>();

  for (const st of (backupData.service_types ?? [])) {
    const existing = await db.getFirstAsync<{ id: number }>(
      "SELECT id FROM service_types WHERE name = ?", [st.name]
    );

    let newStId: number;
    if (existing) {
      newStId = existing.id;
    } else {
      const result = await db.runAsync(
        "INSERT INTO service_types (name, recommended_interval_km, recommended_interval_days) VALUES (?, ?, ?)",
        [st.name, st.recommended_interval_km ?? null, st.recommended_interval_days ?? null]
      );
      newStId = result.lastInsertRowId;
    }
    oldToNewServiceTypeMap.set(st.id, newStId);

    // Map custom fields
    if (st.fields && Array.isArray(st.fields)) {
      for (const field of st.fields) {
        const existingField = await db.getFirstAsync<{ id: number }>(
          "SELECT id FROM custom_fields WHERE service_type_id = ? AND name = ?",
          [newStId, field.name]
        );
        let newFieldId: number;
        if (existingField) {
          newFieldId = existingField.id;
        } else {
          const fResult = await db.runAsync(
            "INSERT INTO custom_fields (service_type_id, name, field_type, unit, required, sort_order, default_value) VALUES (?, ?, ?, ?, ?, ?, ?)",
            [newStId, field.name, field.field_type, field.unit ?? null, (field as any).required ? 1 : 0, (field as any).sort_order ?? 0, (field as any).default_value ?? null]
          );
          newFieldId = fResult.lastInsertRowId;
        }
        oldToNewFieldMap.set(field.id, newFieldId);
      }
    }
  }

  // --- Step 3b: Map service type resets & suggestions ---
  for (const st of (backupData.service_types ?? [])) {
    const parentNewId = oldToNewServiceTypeMap.get(st.id);
    if (!parentNewId) continue;

    if (st.resets && Array.isArray(st.resets)) {
      for (const r of st.resets) {
        const oldResetId = typeof r === "number" ? r : (r as any).id;
        const resetNewId = oldToNewServiceTypeMap.get(oldResetId);
        if (resetNewId) {
          await db.runAsync(
            "INSERT OR IGNORE INTO service_type_resets (parent_id, reset_id) VALUES (?, ?)",
            [parentNewId, resetNewId]
          );
        }
      }
    }

    if (st.suggestions && Array.isArray(st.suggestions)) {
      for (const s of st.suggestions) {
        const oldSugId = typeof s === "number" ? s : (s as any).id;
        const sugNewId = oldToNewServiceTypeMap.get(oldSugId);
        if (sugNewId) {
          await db.runAsync(
            "INSERT OR IGNORE INTO service_type_suggestions (parent_id, suggestion_id) VALUES (?, ?)",
            [parentNewId, sugNewId]
          );
        }
      }
    }
  }

  // --- Step 4: Create vehicles, logs, field values, and overrides ---
  for (const v of vehiclesToCreate) {
    const cleanVin = v.vin && typeof v.vin === "string" && v.vin.trim().length > 0 ? v.vin.trim() : null;
    const vResult = await db.runAsync(
      "INSERT INTO vehicles (make, model, year, vin, initial_mileage, acquisition_date) VALUES (?, ?, ?, ?, ?, ?)",
      [v.make, v.model, v.year ?? null, cleanVin, v.initial_mileage ?? null, v.acquisition_date ?? null]
    );
    const newVehicleId = vResult.lastInsertRowId;

    if (v.maintenance_logs && Array.isArray(v.maintenance_logs)) {
      for (const log of v.maintenance_logs) {
        const mappedStId = log.service_type_id != null ? (oldToNewServiceTypeMap.get(log.service_type_id) ?? null) : null;
        const logDate = log.date || new Date().toISOString().slice(0, 10);
        const logMileage = typeof log.mileage === "number" ? log.mileage : (parseInt(String(log.mileage), 10) || 0);
        const logCost = typeof log.cost === "number" ? log.cost : (parseFloat(String(log.cost)) || 0);
        const logResult = await db.runAsync(
          "INSERT INTO maintenance_logs (vehicle_id, service_type_id, date, mileage, cost, notes) VALUES (?, ?, ?, ?, ?, ?)",
          [newVehicleId, mappedStId, logDate, logMileage, logCost, log.notes ?? null]
        );
        const newLogId = logResult.lastInsertRowId;

        if (log.custom_field_values && Array.isArray(log.custom_field_values)) {
          for (const cfv of log.custom_field_values) {
            const oldFieldId = cfv.field_id ?? (cfv as any).custom_field?.id;
            const mappedFieldId = oldToNewFieldMap.get(oldFieldId);
            if (mappedFieldId) {
              const valStr = cfv.value !== undefined && cfv.value !== null ? String(cfv.value) : "";
              await db.runAsync(
                "INSERT INTO custom_field_values (log_id, field_id, value) VALUES (?, ?, ?)",
                [newLogId, mappedFieldId, valStr]
              );
            }
          }
        }
      }
    }

    if (v.interval_overrides && Array.isArray(v.interval_overrides)) {
      for (const ov of v.interval_overrides) {
        const mappedStId = oldToNewServiceTypeMap.get(ov.service_type_id);
        if (mappedStId) {
          await db.runAsync(
            "INSERT OR IGNORE INTO vehicle_service_interval_overrides (vehicle_id, service_type_id, override_interval_km, override_interval_days) VALUES (?, ?, ?, ?)",
            [newVehicleId, mappedStId, ov.override_interval_km ?? null, ov.override_interval_days ?? null]
          );
        }
      }
    }
  }
}