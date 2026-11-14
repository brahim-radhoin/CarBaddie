import { VehicleRead as Vehicle } from "../types";
import { useNavigate } from "react-router-dom";
import { Gauge, Calendar, ChevronRight } from "lucide-react";
import { useUnits } from "../hooks/useUnits";

interface VehicleCardProps {
  vehicle: Vehicle;
}

export function VehicleCard({ vehicle }: VehicleCardProps) {
  const navigate = useNavigate();
  const units = useUnits();

  const latestLog =
    vehicle.maintenance_logs && vehicle.maintenance_logs.length > 0
      ? vehicle.maintenance_logs[0]
      : null;

  const currentMileage = latestLog ? latestLog.mileage : vehicle.initial_mileage;

  return (
    <div
      onClick={() => navigate(`/vehicles/${vehicle.id}`)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") navigate(`/vehicles/${vehicle.id}`);
      }}
      className="group relative flex flex-col justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/20 hover:bg-accent/30 focus-visible:ring-1 focus-visible:ring-foreground focus-visible:outline-none cursor-pointer"
    >
      <div>
        {/* Top Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-medium text-base text-foreground leading-tight truncate">
              {vehicle.make} {vehicle.model}
            </h3>
            <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2">
              <span>{vehicle.year ?? "Year N/A"}</span>
              {vehicle.vin && (
                <>
                  <span className="opacity-30">/</span>
                  <span className="font-mono text-[11px] opacity-80 uppercase tracking-wide">
                    {vehicle.vin.slice(-6)}
                  </span>
                </>
              )}
            </p>
          </div>
          <span className="font-mono text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground border border-border flex-shrink-0">
            {vehicle.maintenance_logs?.length ?? 0} {vehicle.maintenance_logs?.length === 1 ? "log" : "logs"}
          </span>
        </div>

        {/* Telemetry Row */}
        <div className="grid grid-cols-2 gap-3 mt-4 pt-3 border-t border-border/60 text-xs">
          <div>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Gauge className="h-3 w-3 opacity-60" /> Odometer
            </span>
            <p className="font-mono text-sm font-medium text-foreground mt-0.5">
              {currentMileage !== null && currentMileage !== undefined
                ? units.distance(currentMileage)
                : "—"}
            </p>
          </div>

          <div>
            <span className="text-[11px] text-muted-foreground flex items-center gap-1">
              <Calendar className="h-3 w-3 opacity-60" /> Last Service
            </span>
            <p className="font-mono text-xs font-medium text-foreground mt-1 truncate">
              {latestLog ? latestLog.date : "No records"}
            </p>
          </div>
        </div>
      </div>

      {/* Card Action footer */}
      <div className="flex items-center justify-between mt-4 pt-2 border-t border-border/40 text-xs text-muted-foreground group-hover:text-foreground transition-colors">
        <span>View maintenance schedule</span>
        <ChevronRight className="h-3.5 w-3.5 opacity-60 group-hover:translate-x-0.5 transition-transform" />
      </div>
    </div>
  );
}
