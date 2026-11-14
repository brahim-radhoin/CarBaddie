// The built-in service types seeded on every device. Each has a stable slug and a UUID
// derived from it, so "Oil Change" is the same row on the phone and the desktop and sync
// merges them instead of duplicating them. Never change a slug once shipped.

import { ID_NAMESPACES, uuidv5 } from "../ids/uuid.ts";

export interface BuiltinField {
  /** Stable within its service type; with the slug it gives the field's id. Never change once shipped. */
  key: string;
  name: string;
  field_type: "text" | "number" | "date" | "boolean";
  unit?: string;
}

export interface BuiltinServiceType {
  slug: string;
  name: string;
  km: number | null;
  days: number | null;
  /** Default custom fields, seeded with the same ids on every device. */
  fields?: readonly BuiltinField[];
}

const FILTER_FIELDS: readonly BuiltinField[] = [
  { key: "filter-brand", name: "Filter Brand", field_type: "text" },
  { key: "filter-part", name: "Filter Part #", field_type: "text" },
];
const BRAKE_PAD_FIELDS: readonly BuiltinField[] = [
  { key: "pad-brand", name: "Pad Brand/Material", field_type: "text" },
  { key: "pad-part", name: "Pad Part #", field_type: "text" },
  { key: "rotors-status", name: "Rotors Status", field_type: "text", unit: "Resurfaced, Replaced, Unchanged" },
  { key: "rotor-part", name: "Rotor Part # (if replaced)", field_type: "text" },
];

export const BUILTIN_SERVICE_TYPES: readonly BuiltinServiceType[] = [
  // --- CORE ENGINE & OIL ---
  { slug: "oil-change", name: "Oil Change", km: 8000, days: 180,
    fields: [
      { key: "oil-brand", name: "Oil Brand", field_type: "text" },
      { key: "oil-viscosity", name: "Oil Viscosity", field_type: "text" },
      { key: "oil-amount", name: "Oil Amount", field_type: "number", unit: "L" },
      { key: "drain-plug-washer", name: "Drain Plug Washer Replaced", field_type: "boolean" },
    ],
  },
  { slug: "oil-filter-replacement", name: "Oil Filter Replacement", km: 8000, days: 180 },
  { slug: "engine-air-filter-replacement", name: "Engine Air Filter Replacement", km: 30000, days: 365, fields: FILTER_FIELDS },
  { slug: "spark-plugs-replacement", name: "Spark Plugs Replacement", km: 96000, days: null,
    fields: [
      { key: "plug-brand", name: "Spark Plug Brand/Type", field_type: "text" },
      { key: "plug-part", name: "Spark Plug Part #", field_type: "text" },
      { key: "plug-count", name: "Number of Plugs Replaced", field_type: "number" },
      { key: "gap", name: "Gap Setting", field_type: "text", unit: "mm" },
    ],
  },
  { slug: "coolant-flush", name: "Coolant Flush", km: 96000, days: 1095,
    fields: [
      { key: "coolant-type", name: "Coolant Type Used", field_type: "text" },
      { key: "amount", name: "Amount Added", field_type: "number", unit: "L" },
      { key: "pressure-tested", name: "System Pressure Tested", field_type: "boolean" },
    ],
  },
  { slug: "timing-belt-replacement", name: "Timing Belt Replacement", km: 160000, days: 2555 },
  { slug: "serpentine-belt-replacement", name: "Serpentine Belt Replacement", km: 96000, days: 1825 },

  // --- BRAKES & TIRES ---
  { slug: "tire-rotation", name: "Tire Rotation", km: 8000, days: 180,
    fields: [
      { key: "pattern", name: "Rotation Pattern", field_type: "text" },
      { key: "lug-torque", name: "Lug Nut Torque", field_type: "text", unit: "Nm" },
    ],
  },
  { slug: "tire-replacement", name: "Tire Replacement", km: 80000, days: 2190,
    fields: [
      { key: "tire-brand", name: "Tire Brand", field_type: "text" },
      { key: "tire-model", name: "Tire Model", field_type: "text" },
      { key: "tire-size", name: "Tire Size", field_type: "text" },
      { key: "tire-count", name: "Number of Tires Replaced", field_type: "number" },
      { key: "dot-codes", name: "DOT Code(s)", field_type: "text" },
      { key: "warranty", name: "Warranty Details", field_type: "text" },
    ],
  },
  { slug: "wheel-alignment", name: "Wheel Alignment", km: 24000, days: 365 },
  { slug: "brake-pads-front", name: "Brake Pad Replacement (Front)", km: 64000, days: null, fields: BRAKE_PAD_FIELDS },
  { slug: "brake-pads-rear", name: "Brake Pad Replacement (Rear)", km: 80000, days: null, fields: BRAKE_PAD_FIELDS },
  { slug: "brake-rotors", name: "Brake Rotor Resurfacing / Replacement", km: 112000, days: null },
  { slug: "brake-fluid-flush", name: "Brake Fluid Flush", km: 48000, days: 730 },

  // --- FLUIDS & FILTERS ---
  { slug: "transmission-fluid-change", name: "Transmission Fluid Change", km: 96000, days: 1095,
    fields: [
      { key: "fluid-type", name: "Fluid Type Used", field_type: "text" },
      { key: "amount", name: "Amount Changed/Flushed", field_type: "number", unit: "L" },
      { key: "filter-replaced", name: "Filter Replaced", field_type: "boolean" },
      { key: "filter-part", name: "Filter Part #", field_type: "text" },
    ],
  },
  { slug: "power-steering-fluid-change", name: "Power Steering Fluid Change", km: 80000, days: 1095 },
  { slug: "differential-fluid-change", name: "Differential Fluid Change", km: 80000, days: 1095 },
  { slug: "cabin-air-filter-replacement", name: "Cabin Air Filter Replacement", km: 24000, days: 365, fields: FILTER_FIELDS },
  { slug: "fuel-filter-replacement", name: "Fuel Filter Replacement", km: 64000, days: null, fields: FILTER_FIELDS },

  // --- OTHER COMPONENTS ---
  { slug: "wiper-blade-replacement", name: "Wiper Blade Replacement", km: null, days: 365,
    fields: [
      { key: "position", name: "Position", field_type: "text" },
      { key: "blade", name: "Blade Brand/Type", field_type: "text" },
    ],
  },
  { slug: "battery-replacement", name: "Battery Replacement", km: null, days: 1460,
    fields: [
      { key: "brand", name: "Battery Brand", field_type: "text" },
      { key: "manufacture-date", name: "Battery Manufacture Date", field_type: "date" },
      { key: "warranty-expiration", name: "Battery Warranty Expiration", field_type: "date" },
      { key: "terminals-cleaned", name: "Terminals Cleaned", field_type: "boolean" },
    ],
  },
  { slug: "headlight-bulb-replacement", name: "Headlight Bulb Replacement", km: null, days: null },

  // --- SCHEDULED MILESTONE SERVICES ---
  { slug: "major-service", name: "Major Service (30k / 60k / 90k Mile)", km: 48000, days: 1095 },
  { slug: "minor-service", name: "Minor Service", km: 8000, days: 180 },
  { slug: "multi-point-inspection", name: "Multi-Point Inspection", km: 8000, days: 180 },
];

/** Logging the key also counts as performing each listed service. */
export const BUILTIN_RESETS: Readonly<Record<string, readonly string[]>> = {
  "oil-change": ["oil-filter-replacement"],
  "tire-replacement": ["tire-rotation", "wheel-alignment"],
  "major-service": [
    "oil-change",
    "oil-filter-replacement",
    "tire-rotation",
    "engine-air-filter-replacement",
    "cabin-air-filter-replacement",
    "minor-service",
    "multi-point-inspection",
  ],
  "minor-service": ["oil-change", "oil-filter-replacement", "tire-rotation", "multi-point-inspection"],
  "brake-rotors": ["brake-pads-front", "brake-pads-rear"],
};

/** Services suggested alongside the key when logging it. */
export const BUILTIN_SUGGESTIONS: Readonly<Record<string, readonly string[]>> = {
  "oil-change": ["tire-rotation", "engine-air-filter-replacement", "multi-point-inspection"],
  "tire-rotation": ["brake-pads-front", "brake-pads-rear", "wheel-alignment"],
  "tire-replacement": ["wheel-alignment"],
  "brake-pads-front": ["brake-rotors", "brake-fluid-flush"],
  "brake-pads-rear": ["brake-rotors", "brake-fluid-flush"],
  "engine-air-filter-replacement": ["cabin-air-filter-replacement"],
  "cabin-air-filter-replacement": ["wiper-blade-replacement"],
};

export function builtinServiceTypeId(slug: string): string {
  return uuidv5(slug, ID_NAMESPACES.builtinServiceType);
}

export function builtinFieldId(slug: string, key: string): string {
  return uuidv5(`${slug}/${key}`, ID_NAMESPACES.builtinField);
}

/**
 * Service types that early desktop versions shipped in their bundled database, before the
 * built-ins existed. Opening a database merges each one (exact name, case-insensitive, custom
 * types only) into its built-in: logs, overrides, fields and values move over, and its own
 * intervals replace the built-in's. `null`: delete it if nothing uses it (built-ins cover it).
 */
export const LEGACY_SERVICE_TYPES: Readonly<Record<string, string | null>> = {
  "Engine Oil and Filter Change": "oil-change",
  "Coolant Flush/Exchange": "coolant-flush",
  "Spark Plug Replacement": "spark-plugs-replacement",
  "Tire Replacement (Set)": "tire-replacement",
  "Transmission Fluid Service": "transmission-fluid-change",
  "Brake Pad Replacement": null, // the built-ins split it into Front and Rear
};

const normalise = (name: string) => name.trim().toLowerCase();
const BY_NAME = new Map(BUILTIN_SERVICE_TYPES.map((st) => [normalise(st.name), st]));

/** The built-in a service type name refers to, ignoring case and surrounding spaces. */
export function findBuiltinServiceTypeByName(name: string): BuiltinServiceType | undefined {
  return BY_NAME.get(normalise(name));
}
