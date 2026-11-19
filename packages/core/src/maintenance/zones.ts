// Which part of a vehicle a service type belongs to, for the outline on the garage card.
//
// Zones are keyed by the built-in service type slug (stable forever, builtin.ts). A service type
// the user made (no slug) or one the drawn vehicle has no spot for goes to "other"; the
// milestone services that cover the whole vehicle go to "whole". Both show as chips under the
// outline, not on it.

import type { DueStatus } from "./status.ts";

export type ZoneId = "engine" | "wheels" | "underbody" | "cabin" | "lights" | "whole" | "other";

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
  services: readonly (ZoneService & { slug: string | null })[],
  drawn: readonly DrawnZoneId[],
  alias: Partial<Record<DrawnZoneId, DrawnZoneId>> = {},
): Record<ZoneId, ZoneService[]> {
  const groups: Record<ZoneId, ZoneService[]> = { engine: [], wheels: [], underbody: [], cabin: [], lights: [], whole: [], other: [] };
  for (const { slug, ...service } of services) {
    let zone: ZoneId = (slug && ZONE_OF_SLUG[slug]) || "other";
    if (zone !== "whole" && zone !== "other") {
      zone = alias[zone] ?? zone;
      if (!(drawn as readonly string[]).includes(zone)) zone = "other";
    }
    groups[zone].push(service);
  }
  return groups;
}
