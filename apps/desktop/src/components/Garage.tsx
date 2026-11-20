// The garage on desktop: the same cards, outline, parts and words as the phone's garage deck
// (mobile components/Garage.tsx). Layout differs: a grid of cards and a side sheet instead of
// swipeable cards and a bottom sheet.
import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import {
  BODY_TYPES,
  formatISO,
  moveInGarage,
  STATUS_LABEL,
  summariseStatuses,
  ZONE_LABEL,
  zoneStatus,
  type DrawnZoneId,
  type Garage,
  type ZoneId,
  type ZoneService,
} from "@carbaddie/core";
import { useSetGarageOrder, useVisitsForVehicle } from "../api";
import { useGarageData } from "../hooks/useGarageData";
import { useUnits } from "../hooks/useUnits";
import type { VehicleRead } from "../types";
import { VehicleOutline } from "./VehicleOutline";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";

export type PartsTarget = { vehicle: VehicleRead; zone: ZoneId | "due" | "parts" };

type Dot = "overdue" | "soon" | "ok" | "none";

/** The signature status dot, in the status colour. */
export function StatusDot({ status, className }: { status: Dot; className?: string }) {
  const colour = status === "overdue" ? "bg-destructive" : status === "soon" ? "bg-warn" : status === "ok" ? "bg-ok" : "bg-muted-foreground";
  return <span aria-hidden="true" className={cn("status-dot", colour, className)} />;
}

const dueDot = (due: { status: string }[]): Dot => (due.some((d) => d.status === "Overdue") ? "overdue" : due.length ? "soon" : "ok");
const serviceDot = (status: string): Dot => (status === "Overdue" ? "overdue" : status === "Upcoming" ? "soon" : status === "OK" ? "ok" : "none");
const zoneWords = (status: ReturnType<typeof zoneStatus>) => (status === "overdue" ? "overdue" : status === "soon" ? "due soon" : "on track");

function Chip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="h-8 rounded-md border border-border bg-secondary/60 px-3 text-xs font-medium text-foreground transition-colors hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {label}
    </button>
  );
}

/** Parts, Whole vehicle and Other: the services that are not on the drawing, and a list of all parts. */
function PartChips({ vehicle, onParts }: { vehicle: VehicleRead; onParts: (t: PartsTarget) => void }) {
  const { groups } = useGarageData(vehicle);
  return (
    <div className="flex flex-wrap gap-2">
      <Chip label="Parts" onClick={() => onParts({ vehicle, zone: "parts" })} />
      {groups.whole.length > 0 && (
        <Chip label={`Whole vehicle · ${zoneWords(zoneStatus(groups.whole))}`} onClick={() => onParts({ vehicle, zone: "whole" })} />
      )}
      {groups.other.length > 0 && <Chip label={`Other · ${groups.other.length}`} onClick={() => onParts({ vehicle, zone: "other" })} />}
    </div>
  );
}

/** A big card on the deck: outline, odometer, what is due and the way to log it. */
export function GarageCard({ vehicle, onParts }: { vehicle: VehicleRead; onParts: (t: PartsTarget) => void }) {
  const navigate = useNavigate();
  const units = useUnits();
  const { bodyType, items, groups, due } = useGarageData(vehicle);
  const { data: visits = [] } = useVisitsForVehicle(vehicle.id);
  const upNext = items.filter((i) => i.status === "OK" && i.message.startsWith("Next due"));
  const label = BODY_TYPES.find((t) => t.id === bodyType)?.label ?? "Car";
  const zoneOfService = (serviceTypeId: string): ZoneId =>
    (Object.keys(groups) as ZoneId[]).find((z) => groups[z].some((s) => s.serviceTypeId === serviceTypeId)) ?? "other";

  return (
    <article className="flex flex-col rounded-xl border border-border bg-card p-5">
      <button
        type="button"
        onClick={() => navigate(`/vehicles/${vehicle.id}`)}
        className="-m-1 flex items-start gap-3 rounded-md p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-semibold text-foreground">
            {vehicle.make} {vehicle.model}
          </h3>
          <p className="text-xs text-muted-foreground">{[vehicle.year, label].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="text-right">
          <p className="text-base font-semibold tabular-nums text-foreground">
            {vehicle.current_mileage != null ? units.toDisplay(vehicle.current_mileage).toLocaleString() : "—"}
          </p>
          <p className="text-xs text-muted-foreground">{units.unit}</p>
        </div>
      </button>

      <VehicleOutline className="my-2" bodyType={bodyType} zones={groups} onZone={(zone) => onParts({ vehicle, zone })} />

      <div className="flex items-center gap-2 py-1">
        <StatusDot status={dueDot(due)} />
        <span className="text-sm font-medium text-foreground-secondary">{summariseStatuses(items)}</span>
      </div>

      <ul>
        {due.slice(0, 3).map((item) => (
          <li key={item.serviceTypeId}>
            <button
              type="button"
              onClick={() => onParts({ vehicle, zone: zoneOfService(item.serviceTypeId) })}
              className="flex min-h-10 w-full items-center gap-2.5 rounded-md text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <StatusDot status={item.status === "Overdue" ? "overdue" : "soon"} />
              <span className="truncate text-sm font-medium text-foreground">{item.serviceTypeName}</span>
              <span className="ml-auto shrink-0 text-xs text-muted-foreground">{item.message}</span>
            </button>
          </li>
        ))}
      </ul>
      {due.length < 3 && upNext.length > 0 && (
        <>
          <p className="mt-2 text-xs font-semibold text-muted-foreground">Coming up</p>
          <ul>
            {upNext.slice(0, 3 - due.length).map((item) => (
              <li key={item.serviceTypeId} className="flex min-h-10 items-center gap-2.5">
                <StatusDot status="ok" />
                <span className="truncate text-sm font-medium text-foreground">{item.serviceTypeName}</span>
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">{item.message.replace(/^Next due /, "")}</span>
              </li>
            ))}
          </ul>
        </>
      )}
      {due.length > 3 && (
        <button
          type="button"
          onClick={() => onParts({ vehicle, zone: "due" })}
          className="min-h-10 self-start pl-4 text-xs font-semibold text-brand-accent hover:underline"
        >
          All {due.length} due
        </button>
      )}

      <div className="mt-2">
        <PartChips vehicle={vehicle} onParts={onParts} />
      </div>

      {visits.length === 0 && due.length === 0 && upNext.length === 0 && (
        <p className="mt-3 text-sm text-muted-foreground">Log a visit and CarBaddie works out what is due and when</p>
      )}
      {visits.length > 0 && (
        <>
          <p className="mt-3 text-xs font-semibold text-muted-foreground">Recent visits</p>
          <ul>
            {visits.slice(0, 2).map((visit) => (
              <li key={visit.id}>
                <button
                  type="button"
                  onClick={() =>
                    navigate(visit.standalone ? `/vehicles/${vehicle.id}/logs/${visit.id}/edit` : `/vehicles/${vehicle.id}/visits/${visit.id}/edit`)
                  }
                  className="flex min-h-10 w-full items-center gap-2.5 rounded-md text-left hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="w-24 shrink-0 text-xs tabular-nums text-muted-foreground">{formatISO(visit.date)}</span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                    {visit.items.map((i) => i.service_type?.name ?? "Service").join(" + ") || "Service"}
                  </span>
                  <span className="shrink-0 text-xs tabular-nums text-muted-foreground">{units.money(visit.total_cost_cents)}</span>
                </button>
              </li>
            ))}
          </ul>
        </>
      )}

      <Button className="mt-4 h-9 gap-1.5 text-xs font-medium" onClick={() => navigate(`/vehicles/${vehicle.id}/add-log`)}>
        <Plus className="h-3.5 w-3.5" />
        Add visit
      </Button>
    </article>
  );
}

/** The empty garage: a dashed outline and the one thing to do. */
export function EmptyGarage({ onAdd }: { onAdd: () => void }) {
  const none = { engine: [], wheels: [], underbody: [], cabin: [], lights: [], whole: [], other: [] };
  return (
    <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 text-center">
      <VehicleOutline bodyType="car" zones={none} dashed />
      <h3 className="mt-3 text-lg font-semibold text-foreground">Add your first vehicle</h3>
      <p className="mt-1 text-sm text-muted-foreground">Pick its type and your garage gets a matching outline that shows what is due</p>
      <Button className="mt-4 h-9 gap-1.5 text-xs font-medium" onClick={onAdd}>
        <Plus className="h-3.5 w-3.5" />
        Add vehicle
      </Button>
    </div>
  );
}

/** The outline with its parts on the vehicle page (the phone shows it on the garage card only). */
export function VehiclePartsPanel({ vehicle }: { vehicle: VehicleRead }) {
  const [target, setTarget] = useState<PartsTarget | null>(null);
  const { bodyType, groups } = useGarageData(vehicle);
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <VehicleOutline className="mx-auto max-w-xl" bodyType={bodyType} zones={groups} onZone={(zone) => setTarget({ vehicle, zone })} />
      <div className="mt-2 flex justify-center">
        <PartChips vehicle={vehicle} onParts={setTarget} />
      </div>
      <PartsSheet target={target} onClose={() => setTarget(null)} />
    </div>
  );
}

/**
 * Arrange the garage: the order of the deck cards and of the other vehicles, as the phone's
 * Arrange garage screen. The order is a synced preference; what is on the deck stays the
 * favourite switch's job.
 */
export function ArrangeSheet({ garage, open, onClose }: { garage: Garage<VehicleRead>; open: boolean; onClose: () => void }) {
  const setOrder = useSetGarageOrder();
  const move = (id: string, step: -1 | 1) => {
    const next = moveInGarage(garage, id, step);
    if (next) setOrder.mutate(next);
  };
  const group = (title: string, list: VehicleRead[]) =>
    list.length > 0 && (
      <section className="space-y-2">
        <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
        <ul className="divide-y divide-border rounded-lg border border-border">
          {list.map((v, i) => {
            const name = `${v.make} ${v.model}`;
            return (
              <li key={v.id} className="flex min-h-12 items-center gap-1 pl-3 pr-1.5">
                <span className="min-w-0 flex-1 truncate text-sm text-foreground">{name}</span>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Move ${name} earlier`} disabled={i === 0} onClick={() => move(v.id, -1)}>
                  <ArrowUp className="h-4 w-4" />
                </Button>
                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label={`Move ${name} later`} disabled={i === list.length - 1} onClick={() => move(v.id, 1)}>
                  <ArrowDown className="h-4 w-4" />
                </Button>
              </li>
            );
          })}
        </ul>
      </section>
    );
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Arrange garage</SheetTitle>
          <SheetDescription>The first card is the one the garage opens on. The order is the same on all your devices.</SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-6">
          {group("Garage deck", garage.deck)}
          {group("Other vehicles", garage.others)}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** The services of one part (or all that are due, or every part), each with a way to log it. */
export function PartsSheet({ target, onClose }: { target: PartsTarget | null; onClose: () => void }) {
  return (
    <Sheet open={!!target} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="gap-0 overflow-y-auto sm:max-w-md">
        {/* The body calls hooks that need a vehicle, so it only exists while there is a target. */}
        {target && <PartsSheetBody key={target.vehicle.id} target={target} onClose={onClose} />}
      </SheetContent>
    </Sheet>
  );
}

const rank = (s: string) => (s === "Overdue" ? 0 : s === "Upcoming" ? 1 : 2);

function PartsSheetBody({ target, onClose }: { target: PartsTarget; onClose: () => void }) {
  const navigate = useNavigate();
  const vehicle = target.vehicle;
  const { art, groups, due } = useGarageData(vehicle);
  const name = `${vehicle.make} ${vehicle.model}`;

  const log = (serviceTypeId: string) => {
    onClose();
    navigate(`/vehicles/${vehicle.id}/add-log?service_type_id=${encodeURIComponent(serviceTypeId)}`);
  };

  const serviceRows = (list: Pick<ZoneService, "serviceTypeId" | "name" | "status" | "message">[]) =>
    list.length === 0 ? (
      <p className="py-6 text-center text-sm text-muted-foreground">No service types here yet</p>
    ) : (
      <ul className="divide-y divide-border">
        {list.map((s) => (
          <li key={s.serviceTypeId} className="flex min-h-14 items-center gap-3 py-2">
            <StatusDot status={serviceDot(s.status)} />
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-foreground">{s.name}</p>
              <p className="text-xs text-muted-foreground">
                {s.status === "NeverDone" || s.status === "NoInterval" ? STATUS_LABEL[s.status] : `${STATUS_LABEL[s.status]} · ${s.message}`}
              </p>
            </div>
            <Button variant="outline" size="sm" className="h-8 px-3 text-xs" onClick={() => log(s.serviceTypeId)}>
              Log
            </Button>
          </li>
        ))}
      </ul>
    );

  let title: string;
  let body: ReactNode;
  if (target.zone === "parts") {
    title = "Parts";
    const zones = ([...Object.keys(art.zones), "whole", "other"] as ZoneId[]).filter((z) => groups[z].length > 0 || z in art.zones);
    body = (
      <ul className="divide-y divide-border">
        {zones.map((z) => (
          <li key={z} className="py-2.5">
            <div className="flex items-center gap-3">
              <StatusDot status={zoneStatus(groups[z])} />
              <span className="text-sm font-medium text-foreground">
                {((art.labels as Record<string, string>)[z] ?? ZONE_LABEL[z]) + ` (${groups[z].length})`}
              </span>
            </div>
            {groups[z].map((s) => (
              <p key={s.serviceTypeId} className="py-1 pl-5 text-xs text-muted-foreground">
                {s.name} · {STATUS_LABEL[s.status]}
              </p>
            ))}
          </li>
        ))}
      </ul>
    );
  } else if (target.zone === "due") {
    title = "Due";
    body = serviceRows(due.map((d) => ({ serviceTypeId: d.serviceTypeId, name: d.serviceTypeName, status: d.status, message: d.message })));
  } else {
    const zone = target.zone;
    title = (zone in art.labels ? art.labels[zone as DrawnZoneId] : undefined) ?? ZONE_LABEL[zone];
    body = serviceRows([...groups[zone]].sort((a, b) => rank(a.status) - rank(b.status)));
  }

  return (
    <>
      <SheetHeader className="border-b border-border">
        <SheetTitle>{title}</SheetTitle>
        <SheetDescription>{name}</SheetDescription>
      </SheetHeader>
      <div className="px-4 pb-4">{body}</div>
    </>
  );
}
