import { useParams, Link, Outlet, Navigate, useLocation, matchPath, useNavigate } from "react-router-dom";
import { useVehicle, useServiceType } from "../api";
import { VehicleRead } from "../types";
import { toast } from "sonner";

// UI Components
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

// Icons
import { MoreHorizontal, Plus, Settings, Edit, ChevronLeft } from "lucide-react";

export type VehicleDetailContext = {
  vehicle: VehicleRead;
};

export function VehicleDetailPage() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const location = useLocation();
  const navigate = useNavigate();

  const { data: vehicle, isLoading, isError, error } = useVehicle(vehicleId);

  const historyMatch = matchPath({ path: "/vehicles/:vehicleId/history/:serviceTypeId" }, location.pathname);
  const serviceTypeId = historyMatch?.params.serviceTypeId;
  const { data: serviceType } = useServiceType(serviceTypeId);

  const isSettings = location.pathname.endsWith("/settings");
  const isAddLog = location.pathname.endsWith("/add-log") || location.pathname.includes("/add-log?");
  const isEditLog = matchPath({ path: "/vehicles/:vehicleId/logs/:logId/edit" }, location.pathname);
  const isChildPage = serviceTypeId || isSettings || isAddLog || isEditLog;

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError) {
    toast.error((error as Error | null)?.message || "Vehicle not found.");
    return <Navigate to="/vehicles" replace />;
  }

  if (!vehicle) {
    return <Navigate to="/vehicles" replace />;
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Contextual Header / Breadcrumbs */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pb-4 border-b border-border">
        <div className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
          <Link
            to="/vehicles"
            className="hover:text-foreground transition-colors flex items-center gap-1"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            <span>Vehicles</span>
          </Link>
          <span className="opacity-40">/</span>
          <Link
            to={`/vehicles/${vehicle.id}`}
            className="font-medium text-foreground truncate hover:underline"
          >
            {vehicle.year ? `${vehicle.year} ` : ""}
            {vehicle.make} {vehicle.model}
          </Link>

          {serviceType && (
            <>
              <span className="opacity-40">/</span>
              <span className="truncate">{serviceType.name}</span>
            </>
          )}
          {isSettings && (
            <>
              <span className="opacity-40">/</span>
              <span>Settings</span>
            </>
          )}
          {isAddLog && (
            <>
              <span className="opacity-40">/</span>
              <span>New Log</span>
            </>
          )}
          {isEditLog && (
            <>
              <span className="opacity-40">/</span>
              <span>Edit Log</span>
            </>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-start sm:self-auto flex-shrink-0">
          {!isChildPage && (
            <>
              <Button
                size="sm"
                className="h-8 px-3 text-xs gap-1.5"
                onClick={() => navigate(`/vehicles/${vehicle.id}/add-log`)}
              >
                <Plus className="h-3.5 w-3.5" />
                Add Log
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 px-2.5 text-xs gap-1"
                onClick={() => navigate(`/vehicles/${vehicle.id}/edit`)}
              >
                <Edit className="h-3.5 w-3.5" />
                Edit
              </Button>
            </>
          )}

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded text-muted-foreground hover:text-foreground">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-xs">
              <DropdownMenuItem onClick={() => navigate(`/vehicles/${vehicle.id}/settings`)}>
                <Settings className="mr-2 h-3.5 w-3.5 opacity-70" />
                Vehicle Settings
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Child Route Outlet */}
      <Outlet context={{ vehicle }} />
    </div>
  );
}
