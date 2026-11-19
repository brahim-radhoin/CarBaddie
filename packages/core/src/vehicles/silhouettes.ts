// The outlines the garage draws, as plain data both apps render with their own SVG library.
//
// All outlines share one frame (`FRAME`), one ground line and one stroke, so any of them can sit
// on the same card. Zones are the parts a service can belong to (maintenance/zones.ts): each has
// a tint area, the tap targets (at least 46 units on a side, about 48dp on a card) and where its
// status badge goes. A zone an outline doesn't draw is sent to another with `alias`, or to the
// "Other" chip.
//
// The car is a sport hatchback on purpose: it is drawn after a modern sport supermini, the car
// this app was built for.

import type { BodyTypeId } from "./body-types.ts";
import type { DrawnZoneId } from "../maintenance/zones.ts";

export const FRAME = { viewBox: "30 24 272 128", width: 272, height: 128, groundY: 140.5 } as const;

export type Hit = { shape: "rect"; x: number; y: number; w: number; h: number } | { shape: "circle"; cx: number; cy: number; r: number };

export interface SilhouetteZone {
  /** Filled where the zone is, in the status colour. */
  tint: string[];
  tintCircles: [cx: number, cy: number, r: number][];
  hits: Hit[];
  badge: [x: number, y: number];
}

export interface Silhouette {
  outline: string;
  /** Thinner strokes on top of the outline: windows, lamps, grille. */
  detail: string;
  /** Thinnest and faintest: panel gaps. */
  faint: string;
  wheels: { cx: number; cy: number; r: number; style: "plain" | "sport" }[];
  zones: Partial<Record<DrawnZoneId, SilhouetteZone>>;
  alias: Partial<Record<DrawnZoneId, DrawnZoneId>>;
  /** Names that differ from the default zone name on this outline. */
  labels: Partial<Record<DrawnZoneId, string>>;
}

/** The spokes of a sport wheel, as one path. */
export function sportSpokes(cx: number, cy: number, r: number, count = 5): string {
  const parts: string[] = [];
  for (let i = 0; i < count; i++) {
    const a = (Math.PI * 2 * i) / count - Math.PI / 2;
    const f = (k: number) => `${(cx + Math.cos(a) * r * k).toFixed(1)} ${(cy + Math.sin(a) * r * k).toFixed(1)}`;
    parts.push(`M${f(0.22)} L${f(0.74)}`);
  }
  return parts.join(" ");
}

const rect = (x: number, y: number, w: number, h: number): Hit => ({ shape: "rect", x, y, w, h });
const circle = (cx: number, cy: number, r: number): Hit => ({ shape: "circle", cx, cy, r });

export const SILHOUETTES: Record<BodyTypeId, Silhouette> = {
  car: {
    outline:
      "M54 124 L53 112 Q51 96 55 85 Q57 79 62 76 L96 58 Q128 53 160 53 Q177 53 189 64 L214 91 Q219 95 227 96 L254 100 Q271 103 277 112 L280 124 L255 124 A23 23 0 0 0 209 124 L113 124 A23 23 0 0 0 67 124 Z",
    detail:
      "M70 89 L73 82 Q76 77 84 74 L100 66 Q130 61 160 60 Q172 60 181 67 L206 90 Z M110 64 L105 89 M113 118 L209 118 M195 88 L203 91 L201 95 L194 93 Z M258 100 L274 105 L274 109 L257 105 Z M268 114 L278 114 M266 118 L278 118 M57 92 L62 92 L63 103 L57 103 M56 118 L68 122 M64 75 Q58 71 51 72 L50 75 Q57 76 62 79",
    faint: "M104 90 L108 118 M192 89 L193 118",
    wheels: [
      { cx: 90, cy: 121, r: 19, style: "sport" },
      { cx: 232, cy: 121, r: 19, style: "sport" },
    ],
    zones: {
      engine: { tint: ["M219 96 L254 100 Q271 103 277 112 L279 122 L256 122 Q254 103 232 97 Z"], tintCircles: [], hits: [rect(212, 68, 68, 52)], badge: [262, 84] },
      wheels: { tint: [], tintCircles: [[90, 121, 21], [232, 121, 21]], hits: [circle(90, 121, 27), circle(232, 121, 27)], badge: [210, 105] },
      underbody: { tint: ["M113 118 L209 118 L209 124 L113 124 Z"], tintCircles: [], hits: [rect(112, 98, 98, 50)], badge: [161, 104] },
      cabin: { tint: ["M70 89 L73 82 Q76 77 84 74 L100 66 Q130 61 160 60 Q172 60 181 67 L206 90 Z"], tintCircles: [], hits: [rect(96, 42, 112, 56)], badge: [140, 44] },
    },
    alias: { lights: "engine" },
    labels: {},
  },

  motorbike: {
    outline:
      "M138 84 Q160 66 196 72 L206 84 L196 90 L146 92 Z M80 84 L100 80 L138 84 L146 92 L104 96 Q86 96 80 84 Z M132 92 L190 90 L196 118 L146 120 L132 108 Z M150 80 L182 80 L184 90 L148 90 Z M128 104 L82 114 M216 72 L240 114 M204 64 L220 66 M152 116 L112 122 L68 118 M128 92 L116 108 M216 98 Q240 80 264 98",
    detail: "M226 74 m-7 0 a7 7 0 1 0 14 0 a7 7 0 1 0 -14 0 M82 114 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 M240 114 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0",
    faint: "",
    wheels: [
      { cx: 82, cy: 114, r: 26, style: "plain" },
      { cx: 240, cy: 114, r: 26, style: "plain" },
    ],
    zones: {
      engine: { tint: ["M132 92 L190 90 L196 118 L146 120 L132 108 Z"], tintCircles: [], hits: [rect(126, 76, 84, 54)], badge: [176, 70] },
      wheels: { tint: [], tintCircles: [[82, 114, 28], [240, 114, 28]], hits: [circle(82, 114, 30), circle(240, 114, 30)], badge: [262, 84] },
      lights: { tint: [], tintCircles: [[226, 74, 10]], hits: [circle(228, 66, 24)], badge: [232, 48] },
    },
    alias: { underbody: "engine" },
    labels: {},
  },

  snowmobile: {
    outline:
      "M44 108 L50 84 Q54 78 62 78 L128 78 Q140 78 146 72 L168 72 L240 86 Q272 92 280 104 L282 112 Q282 118 272 118 L200 118 L152 114 L50 112 Z M170 74 L184 44 Q189 41 193 46 L197 58 M190 58 L202 55 M188 140 L276 140 Q296 140 300 122 M236 140 L232 118 M48 112 L48 126 Q48 140 62 140 L184 140 Q198 140 198 126 L198 112",
    detail:
      "M270 98 L278 102 L278 108 L268 106 M68 126 m-8 0 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0 M178 126 m-8 0 a8 8 0 1 0 16 0 a8 8 0 1 0 -16 0 M104 130 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 M128 130 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0 M152 130 m-5 0 a5 5 0 1 0 10 0 a5 5 0 1 0 -10 0",
    faint: "",
    wheels: [],
    zones: {
      engine: { tint: ["M170 74 L240 86 Q272 92 280 104 L282 112 Q282 118 272 118 L200 118 L170 114 Z"], tintCircles: [], hits: [rect(164, 62, 128, 64)], badge: [226, 70] },
      wheels: {
        tint: ["M48 114 L198 114 L198 126 Q198 139 184 139 L62 139 Q48 139 48 126 Z", "M206 135 L280 135 Q293 135 296 124 L206 124 Z"],
        tintCircles: [],
        hits: [rect(42, 106, 164, 48), rect(206, 110, 98, 48)],
        badge: [122, 102],
      },
    },
    alias: { underbody: "engine", lights: "engine" },
    labels: { wheels: "Track and skis" },
  },
};
