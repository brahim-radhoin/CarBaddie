import { NavLink, useNavigate } from "react-router-dom";
import {
  Settings,
  Wrench,
  LayoutGrid,
  ChevronRight,
  Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { ModeToggle } from "./ModeToggle";
import { useVehicles } from "../api";
import { useUnits } from "../hooks/useUnits";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export function Sidebar() {
  const { data: vehicles = [] } = useVehicles();
  const navigate = useNavigate();
  const units = useUnits();
  const [vehiclesOpen, setVehiclesOpen] = useState(true);

  return (
    <aside className="app-shell-sidebar">
      {/* Brand Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-sidebar-border flex-shrink-0">
        <div className="flex items-center gap-2.5">
          <img
            src="/carbaddie-logo.png"
            alt="CarBaddie"
            className="w-7 h-7 rounded object-cover border border-border"
          />
          <span className="font-semibold text-sm tracking-tight text-sidebar-foreground">
            CarBaddie
          </span>
        </div>
        <ModeToggle />
      </div>

      {/* Nav Content */}
      <nav className="flex-1 px-3 py-4 space-y-5 overflow-y-auto">
        {/* Fleet / Primary Overview */}
        <div className="space-y-1">
          <NavLink
            to="/vehicles"
            end
            className={({ isActive }) =>
              cn("sidebar-nav-item", isActive && "active")
            }
          >
            <LayoutGrid className="h-4 w-4 flex-shrink-0 opacity-70" />
            <span>Overview</span>
          </NavLink>
        </div>

        {/* Vehicles List Section */}
        <div className="space-y-1">
          <div className="flex items-center justify-between px-2 py-1 text-xs font-medium text-muted-foreground">
            <button
              onClick={() => setVehiclesOpen(!vehiclesOpen)}
              className="flex items-center gap-1.5 hover:text-foreground transition-colors"
            >
              <ChevronRight
                className={cn(
                  "h-3.5 w-3.5 transition-transform duration-150",
                  vehiclesOpen && "rotate-90"
                )}
              />
              <span>Vehicles</span>
              <span className="font-mono text-[11px] opacity-70">
                ({vehicles.length})
              </span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 rounded text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
              onClick={() => navigate("/vehicles/new")}
              title="Add Vehicle"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>

          {vehiclesOpen && (
            <div className="space-y-0.5 pl-3 border-l border-sidebar-border ml-3 mt-1">
              {vehicles.length === 0 ? (
                <button
                  onClick={() => navigate("/vehicles/new")}
                  className="w-full text-left text-xs text-muted-foreground hover:text-foreground px-2 py-1.5 rounded transition-colors"
                >
                  + Add your first vehicle
                </button>
              ) : (
                vehicles.map((v) => (
                  <NavLink
                    key={v.id}
                    to={`/vehicles/${v.id}`}
                    className={({ isActive }) =>
                      cn(
                        "group flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-medium transition-colors text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent",
                        isActive && "bg-sidebar-accent text-sidebar-foreground font-semibold"
                      )
                    }
                  >
                    <span className="truncate">
                      {v.year ? `${v.year} ` : ""}
                      {v.make} {v.model}
                    </span>
                    {v.initial_mileage && (
                      <span className="font-mono text-[10px] text-muted-foreground opacity-60 ml-1.5 flex-shrink-0">
                        {units.distance(v.initial_mileage)}
                      </span>
                    )}
                  </NavLink>
                ))
              )}
            </div>
          )}
        </div>

        {/* Global Settings & Configuration */}
        <div className="space-y-1">
          <p className="px-2 py-1 text-xs font-medium text-muted-foreground">
            Configuration
          </p>
          <NavLink
            to="/service-types"
            className={({ isActive }) =>
              cn("sidebar-nav-item", isActive && "active")
            }
          >
            <Wrench className="h-4 w-4 flex-shrink-0 opacity-70" />
            <span>Service Types</span>
          </NavLink>
          <NavLink
            to="/settings"
            className={({ isActive }) =>
              cn("sidebar-nav-item", isActive && "active")
            }
          >
            <Settings className="h-4 w-4 flex-shrink-0 opacity-70" />
            <span>Backup & Settings</span>
          </NavLink>
        </div>
      </nav>

      {/* Footer Info */}
      <div className="px-4 py-3 border-t border-sidebar-border flex items-center justify-between text-xs text-muted-foreground">
        <span className="font-mono text-[11px] opacity-75">CarBaddie v0.1.0</span>
        <span className="text-[11px] font-mono opacity-50">Local DB</span>
      </div>
    </aside>
  );
}
