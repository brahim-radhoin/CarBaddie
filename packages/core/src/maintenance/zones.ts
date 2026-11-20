// Which part of a vehicle a service type belongs to: the spot on the garage outline, and the group
// it is listed under (service types list, pickers).
//
// `service_types.zone` holds the part the user chose (migration v9). NULL means not chosen: a
// built-in then takes its part from its slug (stable forever, builtin.ts) and a service type the
// user made goes to "other", the same on every device. The column is a plain string, so a part a
// newer app knows passes through; this app shows it as if unset. A part the drawn vehicle has no
// spot for goes to "other"; the milestone services that cover the whole vehicle go to "whole".
// Both show as chips under the outline, not on it.

import type { DueStatus } from "./status.ts";

export type ZoneId = "engine" | "wheels" | "underbody" | "cabin" | "lights" | "whole" | "other";

/** Every part, in the order lists show them. */
export const ZONE_IDS: readonly ZoneId[] = ["engine", "wheels", "underbody", "cabin", "lights", "whole", "other"];

export function isZoneId(value: unknown): value is ZoneId {
  return typeof value === "string" && (ZONE_IDS as readonly string[]).includes(value);
}

/** The zones drawn on an outline; "whole" and "other" are chips. */
export type DrawnZoneId = Exclude<ZoneId, "whole" | "other">;

export const ZONE_LABEL: Record<ZoneId, string> = {
  engine: "Engine bay",
  wheels: "Wheels and brakes",
  underbody: "Underbody",
  cabin: "Cabin and glass",
  lights: "Lights",
  whole: "Whole vehicle",
  other: "Other service types",
};

export const ZONE_OF_SLUG: Readonly<Record<string, ZoneId>> = {
  "oil-change": "engine",
  "oil-filter-replacement": "engine",
  "engine-air-filter-replacement": "engine",
  "spark-plugs-replacement": "engine",
  "coolant-flush": "engine",
  "timing-belt-replacement": "engine",
  "serpentine-belt-replacement": "engine",
  "power-steering-fluid-change": "engine",
  "battery-replacement": "engine",
  "headlight-bulb-replacement": "lights",
  "tire-rotation": "wheels",
  "tire-replacement": "wheels",
  "wheel-alignment": "wheels",
  "brake-pads-front": "wheels",
  "brake-pads-rear": "wheels",
  "brake-rotors": "wheels",
  "brake-fluid-flush": "wheels",
  "transmission-fluid-change": "underbody",
  "differential-fluid-change": "underbody",
  "fuel-filter-replacement": "underbody",
  "cabin-air-filter-replacement": "cabin",
  "wiper-blade-replacement": "cabin",
  "major-service": "whole",
  "minor-service": "whole",
  "multi-point-inspection": "whole",
};

/** The part a service type is in: the one chosen, else its built-in's, else "other". */
export function serviceTypeZone(st: { slug?: string | null; zone?: string | null }): ZoneId {
  if (isZoneId(st.zone)) return st.zone;
  return (st.slug && ZONE_OF_SLUG[st.slug]) || "other";
}

/** Service types grouped by part, in list order, empty parts left out. Keeps the order within a part. */
export function groupServiceTypes<T extends { slug?: string | null; zone?: string | null }>(
  types: readonly T[],
): { zone: ZoneId; label: string; types: T[] }[] {
  return ZONE_IDS.map((zone) => ({ zone, label: ZONE_LABEL[zone], types: types.filter((t) => serviceTypeZone(t) === zone) })).filter(
    (g) => g.types.length > 0,
  );
}

export type ZoneStatus = "overdue" | "soon" | "ok";

/** The worst of a zone's services. Only Overdue and Due soon count; the rest is on track. */
export function zoneStatus(items: readonly { status: DueStatus }[]): ZoneStatus {
  if (items.some((i) => i.status === "Overdue")) return "overdue";
  if (items.some((i) => i.status === "Upcoming")) return "soon";
  return "ok";
}

export interface ZoneService {
  serviceTypeId: string;
  name: string;
  status: DueStatus;
  message: string;
}

/**
 * Puts each service on the zone of a particular outline. `drawn` lists the zones the outline
 * has; `alias` sends a zone it doesn't draw to one it does (the headlight to the engine bay on
 * a car, say). Anything left over goes to "other".
 */
export function groupByZone(
  services: readonly (ZoneService & { slug: string | null; zone?: string | null })[],
  drawn: readonly DrawnZoneId[],
  alias: Partial<Record<DrawnZoneId, DrawnZoneId>> = {},
): Record<ZoneId, ZoneService[]> {
  const groups: Record<ZoneId, ZoneService[]> = { engine: [], wheels: [], underbody: [], cabin: [], lights: [], whole: [], other: [] };
  for (const { slug, zone: chosen, ...service } of services) {
    let zone = serviceTypeZone({ slug, zone: chosen });
    if (zone !== "whole" && zone !== "other") {
      zone = alias[zone] ?? zone;
      if (!(drawn as readonly string[]).includes(zone)) zone = "other";
    }
    groups[zone].push(service);
  }
  return groups;
}
