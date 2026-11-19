import { VehicleRead as Vehicle } from "../types";
import { useNavigate } from "react-router-dom";
import { useUnits } from "../hooks/useUnits";

interface VehicleCardProps {
  vehicle: Vehicle;
}

/** Same three numbers as the phone's vehicle card: odometer, total spent, logs. */
export function VehicleCard({ vehicle }: VehicleCardProps) {
  const navigate = useNavigate();
  const units = useUnits();

  const logs = vehicle.maintenance_logs ?? [];
  const totalCostCents = logs.reduce((sum, l) => sum + l.cost_cents, 0);
  const currentMileage = vehicle.current_mileage;

  return (
    <button
      type="button"
      onClick={() => navigate(`/vehicles/${vehicle.id}`)}
      className="group flex w-full flex-col rounded-lg border border-border bg-card p-4 text-left transition-colors hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <h3 className="truncate text-base font-medium leading-tight text-foreground">
        {vehicle.make} {vehicle.model}
      </h3>
      <p className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
        <span>{vehicle.year ?? "Year unknown"}</span>
        {vehicle.vin && (
          <>
            <span aria-hidden className="opacity-40">/</span>
            <span className="font-mono">{vehicle.vin.slice(-6)}</span>
          </>
        )}
      </p>

      <dl className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)_auto] gap-4 border-t border-border pt-3">
        <div>
          <dt className="text-xs text-muted-foreground">Odometer</dt>
          <dd className="mt-0.5 text-sm font-medium tabular-nums text-foreground">
            {currentMileage !== null && currentMileage !== undefined ? units.distance(currentMileage) : "—"}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Total spent</dt>
          <dd className="mt-0.5 text-sm font-medium tabular-nums text-foreground">{units.money(totalCostCents)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted-foreground">Logs</dt>
          <dd className="mt-0.5 text-sm font-medium tabular-nums text-foreground">{logs.length}</dd>
        </div>
      </dl>
    </button>
  );
}
