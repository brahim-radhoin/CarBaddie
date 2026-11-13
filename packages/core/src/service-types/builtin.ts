// The built-in service types seeded on every device. Each has a stable slug and a UUID
// derived from it, so "Oil Change" is the same row on the phone and the desktop and sync
// merges them instead of duplicating them. Never change a slug once shipped.

import { ID_NAMESPACES, uuidv5 } from "../ids/uuid.ts";

export interface BuiltinServiceType {
  slug: string;
  name: string;
  km: number | null;
  days: number | null;
}

export const BUILTIN_SERVICE_TYPES: readonly BuiltinServiceType[] = [
  // --- CORE ENGINE & OIL ---
  { slug: "oil-change", name: "Oil Change", km: 8000, days: 180 },
  { slug: "oil-filter-replacement", name: "Oil Filter Replacement", km: 8000, days: 180 },
  { slug: "engine-air-filter-replacement", name: "Engine Air Filter Replacement", km: 30000, days: 365 },
  { slug: "spark-plugs-replacement", name: "Spark Plugs Replacement", km: 96000, days: null },
  { slug: "coolant-flush", name: "Coolant Flush", km: 96000, days: 1095 },
  { slug: "timing-belt-replacement", name: "Timing Belt Replacement", km: 160000, days: 2555 },
  { slug: "serpentine-belt-replacement", name: "Serpentine Belt Replacement", km: 96000, days: 1825 },

  // --- BRAKES & TIRES ---
  { slug: "tire-rotation", name: "Tire Rotation", km: 8000, days: 180 },
  { slug: "tire-replacement", name: "Tire Replacement", km: 80000, days: 2190 },
  { slug: "wheel-alignment", name: "Wheel Alignment", km: 24000, days: 365 },
  { slug: "brake-pads-front", name: "Brake Pad Replacement (Front)", km: 64000, days: null },
  { slug: "brake-pads-rear", name: "Brake Pad Replacement (Rear)", km: 80000, days: null },
  { slug: "brake-rotors", name: "Brake Rotor Resurfacing / Replacement", km: 112000, days: null },
  { slug: "brake-fluid-flush", name: "Brake Fluid Flush", km: 48000, days: 730 },

  // --- FLUIDS & FILTERS ---
  { slug: "transmission-fluid-change", name: "Transmission Fluid Change", km: 96000, days: 1095 },
  { slug: "power-steering-fluid-change", name: "Power Steering Fluid Change", km: 80000, days: 1095 },
  { slug: "differential-fluid-change", name: "Differential Fluid Change", km: 80000, days: 1095 },
  { slug: "cabin-air-filter-replacement", name: "Cabin Air Filter Replacement", km: 24000, days: 365 },
  { slug: "fuel-filter-replacement", name: "Fuel Filter Replacement", km: 64000, days: null },

  // --- OTHER COMPONENTS ---
  { slug: "wiper-blade-replacement", name: "Wiper Blade Replacement", km: null, days: 365 },
  { slug: "battery-replacement", name: "Battery Replacement", km: null, days: 1460 },
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

const normalise = (name: string) => name.trim().toLowerCase();
const BY_NAME = new Map(BUILTIN_SERVICE_TYPES.map((st) => [normalise(st.name), st]));

/** The built-in a service type name refers to, ignoring case and surrounding spaces. */
export function findBuiltinServiceTypeByName(name: string): BuiltinServiceType | undefined {
  return BY_NAME.get(normalise(name));
}
