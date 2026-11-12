import type { SQLiteDatabase } from "expo-sqlite";

export const DEFAULT_SERVICE_DATA = [
  // --- CORE ENGINE & OIL ---
  { name: "Oil Change", km: 8000, days: 180 },
  { name: "Oil Filter Replacement", km: 8000, days: 180 },
  { name: "Engine Air Filter Replacement", km: 30000, days: 365 },
  { name: "Spark Plugs Replacement", km: 96000, days: null },
  { name: "Coolant Flush", km: 96000, days: 1095 },
  { name: "Timing Belt Replacement", km: 160000, days: 2555 },
  { name: "Serpentine Belt Replacement", km: 96000, days: 1825 },

  // --- BRAKES & TIRES ---
  { name: "Tire Rotation", km: 8000, days: 180 },
  { name: "Tire Replacement", km: 80000, days: 2190 },
  { name: "Wheel Alignment", km: 24000, days: 365 },
  { name: "Brake Pad Replacement (Front)", km: 64000, days: null },
  { name: "Brake Pad Replacement (Rear)", km: 80000, days: null },
  { name: "Brake Rotor Resurfacing / Replacement", km: 112000, days: null },
  { name: "Brake Fluid Flush", km: 48000, days: 730 },

  // --- FLUIDS & FILTERS ---
  { name: "Transmission Fluid Change", km: 96000, days: 1095 },
  { name: "Power Steering Fluid Change", km: 80000, days: 1095 },
  { name: "Differential Fluid Change", km: 80000, days: 1095 },
  { name: "Cabin Air Filter Replacement", km: 24000, days: 365 },
  { name: "Fuel Filter Replacement", km: 64000, days: null },

  // --- OTHER COMPONENTS ---
  { name: "Wiper Blade Replacement", km: null, days: 365 },
  { name: "Battery Replacement", km: null, days: 1460 },
  { name: "Headlight Bulb Replacement", km: null, days: null },

  // --- SCHEDULED MILESTONE SERVICES ---
  { name: "Major Service (30k / 60k / 90k Mile)", km: 48000, days: 1095 },
  { name: "Minor Service", km: 8000, days: 180 },
  { name: "Multi-Point Inspection", km: 8000, days: 180 },
];

export const RESETS_MAP: Record<string, string[]> = {
  "Oil Change": ["Oil Filter Replacement"],
  "Tire Replacement": ["Tire Rotation", "Wheel Alignment"],
  "Major Service (30k / 60k / 90k Mile)": [
    "Oil Change",
    "Oil Filter Replacement",
    "Tire Rotation",
    "Engine Air Filter Replacement",
    "Cabin Air Filter Replacement",
    "Minor Service",
    "Multi-Point Inspection",
  ],
  "Minor Service": [
    "Oil Change",
    "Oil Filter Replacement",
    "Tire Rotation",
    "Multi-Point Inspection",
  ],
  "Brake Rotor Resurfacing / Replacement": ["Brake Pad Replacement (Front)", "Brake Pad Replacement (Rear)"],
};

export const SUGGESTIONS_MAP: Record<string, string[]> = {
  "Oil Change": ["Tire Rotation", "Engine Air Filter Replacement", "Multi-Point Inspection"],
  "Tire Rotation": ["Brake Pad Replacement (Front)", "Brake Pad Replacement (Rear)", "Wheel Alignment"],
  "Tire Replacement": ["Wheel Alignment"],
  "Brake Pad Replacement (Front)": ["Brake Rotor Resurfacing / Replacement", "Brake Fluid Flush"],
  "Brake Pad Replacement (Rear)": ["Brake Rotor Resurfacing / Replacement", "Brake Fluid Flush"],
  "Engine Air Filter Replacement": ["Cabin Air Filter Replacement"],
  "Cabin Air Filter Replacement": ["Wiper Blade Replacement"],
};

export async function seedDefaultServiceTypes(db: SQLiteDatabase, force: boolean = false): Promise<number> {
  const row = await db.getFirstAsync<{ count: number }>("SELECT COUNT(*) as count FROM service_types");
  if (!force && row && row.count > 0) {
    return 0; // Already seeded
  }

  const nameToId = new Map<string, number>();

  for (const item of DEFAULT_SERVICE_DATA) {
    const existing = await db.getFirstAsync<{ id: number }>(
      "SELECT id FROM service_types WHERE name = ?",
      [item.name]
    );
    if (existing) {
      nameToId.set(item.name, existing.id);
    } else {
      const res = await db.runAsync(
        "INSERT INTO service_types (name, recommended_interval_km, recommended_interval_days) VALUES (?, ?, ?)",
        [item.name, item.km, item.days]
      );
      nameToId.set(item.name, res.lastInsertRowId);
    }
  }

  // Populate resets
  for (const [parentName, resetNames] of Object.entries(RESETS_MAP)) {
    const parentId = nameToId.get(parentName);
    if (!parentId) continue;
    for (const resetName of resetNames) {
      const resetId = nameToId.get(resetName);
      if (!resetId) continue;
      await db.runAsync(
        "INSERT OR IGNORE INTO service_type_resets (parent_id, reset_id) VALUES (?, ?)",
        [parentId, resetId]
      );
    }
  }

  // Populate suggestions
  for (const [parentName, sugNames] of Object.entries(SUGGESTIONS_MAP)) {
    const parentId = nameToId.get(parentName);
    if (!parentId) continue;
    for (const sugName of sugNames) {
      const sugId = nameToId.get(sugName);
      if (!sugId) continue;
      await db.runAsync(
        "INSERT OR IGNORE INTO service_type_suggestions (parent_id, suggestion_id) VALUES (?, ?)",
        [parentId, sugId]
      );
    }
  }

  return DEFAULT_SERVICE_DATA.length;
}