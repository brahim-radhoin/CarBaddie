import {
  FRAME,
  SILHOUETTES,
  sportSpokes,
  ZONE_LABEL,
  zoneStatus,
  type BodyTypeId,
  type DrawnZoneId,
  type SilhouetteZone,
  type ZoneId,
  type ZoneService,
} from "@carbaddie/core";
import { cn } from "@/lib/utils";

const [MIN_X, MIN_Y] = FRAME.viewBox.split(" ").map(Number);
const pct = (v: number, of: number) => `${(v / of) * 100}%`;

/**
 * A vehicle drawn as a line outline, the same drawing as the phone's garage card (core
 * vehicles/silhouettes.ts, mobile VehicleOutline.tsx). Parts with something overdue get a red tint
 * and a solid badge, parts due soon an amber tint and a ring badge: the shape differs as well as
 * the colour. Each part is a real button laid over the drawing, with a spoken name and status.
 */
export function VehicleOutline({
  bodyType,
  zones,
  onZone,
  dashed,
  className,
}: {
  bodyType: BodyTypeId;
  zones: Record<ZoneId, ZoneService[]>;
  onZone?: (zone: DrawnZoneId) => void;
  /** The empty-garage drawing: no status, muted and dashed. */
  dashed?: boolean;
  className?: string;
}) {
  const art = SILHOUETTES[bodyType];
  const stroke = dashed ? "var(--muted-foreground)" : "var(--foreground)";
  const dash = dashed ? "5 5" : undefined;
  const entries = Object.entries(art.zones) as [DrawnZoneId, SilhouetteZone][];

  return (
    <div className={cn("relative w-full", className)} style={{ aspectRatio: `${FRAME.width} / ${FRAME.height}` }}>
      <svg viewBox={FRAME.viewBox} className="absolute inset-0 h-full w-full" aria-hidden="true" focusable="false">
        <line x1={20} y1={FRAME.groundY} x2={300} y2={FRAME.groundY} stroke="var(--border)" strokeWidth={1} strokeDasharray="3 4" />

        {!dashed &&
          entries.map(([zone, z]) => {
            const status = zoneStatus(zones[zone] ?? []);
            if (status === "ok") return null;
            const fill = status === "overdue" ? "var(--destructive)" : "var(--warn)";
            return (
              <g key={`tint-${zone}`} opacity={0.26}>
                {z.tint.map((d, i) => <path key={i} d={d} fill={fill} />)}
                {z.tintCircles.map(([cx, cy, r], i) => <circle key={`c${i}`} cx={cx} cy={cy} r={r} fill={fill} />)}
              </g>
            );
          })}

        <path d={art.outline} fill="none" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" strokeDasharray={dash} />
        <path d={art.detail} fill="none" stroke={stroke} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" opacity={0.85} strokeDasharray={dash} />
        {art.faint ? <path d={art.faint} fill="none" stroke={stroke} strokeWidth={1} strokeLinecap="round" opacity={0.4} /> : null}

        {art.wheels.map((w, i) => (
          <g key={`wheel-${i}`}>
            <circle cx={w.cx} cy={w.cy} r={w.r} fill="var(--card)" stroke={stroke} strokeWidth={2} strokeDasharray={dash} />
            {w.style === "sport" ? (
              <>
                <circle cx={w.cx} cy={w.cy} r={w.r * 0.74} fill="none" stroke={stroke} strokeWidth={1.4} />
                <circle cx={w.cx} cy={w.cy} r={w.r * 0.16} fill="none" stroke={stroke} strokeWidth={1.3} />
                <path d={sportSpokes(w.cx, w.cy, w.r)} fill="none" stroke={stroke} strokeWidth={1.4} strokeLinecap="round" />
              </>
            ) : (
              <circle cx={w.cx} cy={w.cy} r={w.r * 0.42} fill="none" stroke={stroke} strokeWidth={1.5} />
            )}
          </g>
        ))}

        {!dashed &&
          entries.map(([zone, z]) => {
            const status = zoneStatus(zones[zone] ?? []);
            if (status === "ok") return null;
            const [x, y] = z.badge;
            return status === "overdue" ? (
              <g key={`badge-${zone}`}>
                <circle cx={x} cy={y} r={9} fill="var(--destructive)" />
                <path d={`M${x} ${y - 4.5} L${x} ${y + 1}`} stroke="var(--card)" strokeWidth={2} strokeLinecap="round" />
                <circle cx={x} cy={y + 4.2} r={1.2} fill="var(--card)" />
              </g>
            ) : (
              <g key={`badge-${zone}`}>
                <circle cx={x} cy={y} r={8.5} fill="var(--card)" stroke="var(--warn)" strokeWidth={2.2} />
                <path d={`M${x} ${y - 4} L${x} ${y} L${x + 3} ${y + 2}`} fill="none" stroke="var(--warn)" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
              </g>
            );
          })}
      </svg>

      {onZone &&
        entries.flatMap(([zone, z]) =>
          z.hits.map((h, i) => {
            const [x0, y0, w, hgt] = h.shape === "rect" ? [h.x, h.y, h.w, h.h] : [h.cx - h.r, h.cy - h.r, h.r * 2, h.r * 2];
            const status = zoneStatus(zones[zone] ?? []);
            const name = (art.labels[zone] ?? ZONE_LABEL[zone]) + (status === "overdue" ? ", overdue" : status === "soon" ? ", due soon" : ", on track");
            return (
              <button
                key={`${zone}-${i}`}
                type="button"
                aria-label={name}
                title={name}
                onClick={() => onZone(zone)}
                className={cn(
                  "absolute cursor-pointer transition-colors hover:bg-foreground/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  h.shape === "circle" ? "rounded-full" : "rounded-md",
                )}
                style={{ left: pct(x0 - MIN_X, FRAME.width), top: pct(y0 - MIN_Y, FRAME.height), width: pct(w, FRAME.width), height: pct(hgt, FRAME.height) }}
              />
            );
          }),
        )}
    </div>
  );
}
