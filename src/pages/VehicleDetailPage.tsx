import { useParams, Link, Outlet, Navigate, useLocation, matchPath } from "react-router-dom";
import { useVehicle, useServiceType } from "../api";
import { VehicleRead } from "../types";
import { toast } from "sonner";
import { AxiosError } from "axios";

// UI Components
import { Skeleton } from "@/components/ui/skeleton";
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbSeparator,
  BreadcrumbPage,
  BreadcrumbLink,
} from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

// Icons
import { Car, MoreHorizontal, PlusCircle, Settings } from "lucide-react";

// This is a custom type we'll use for the context passed to child routes
export type VehicleDetailContext = {
  vehicle: VehicleRead;
};

export function VehicleDetailPage() {
  const { vehicleId } = useParams<{ vehicleId: string }>();
  const location = useLocation();

  // Fetch the core data for this entire section of the app
  const { data: vehicle, isLoading, isError, error } = useVehicle(vehicleId);

  // Helper to extract service type ID if we are in the history view
  const historyMatch = matchPath({ path: "/vehicles/:vehicleId/history/:serviceTypeId" }, location.pathname);
  const serviceTypeId = historyMatch?.params.serviceTypeId;

  // We only fetch this if we are actually on a history page
  const { data: serviceType } = useServiceType(serviceTypeId);

  // --- Render Logic ---

  if (isLoading) {
    return (
      <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-8 animate-pulse">
        <Skeleton className="h-8 w-64" />
        <div className="flex justify-between items-start">
          <Skeleton className="h-12 w-96" />
          <Skeleton className="h-12 w-48" />
        </div>
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  // If the vehicle doesn't exist, this is a critical error. Redirect.
  if (isError) {
    toast.error((error as AxiosError<{ detail: string }>)?.response?.data?.detail || "Vehicle not found.");
    return <Navigate to="/vehicles" replace />;
  }

  // If we're done loading but have no vehicle, something went wrong.
  if (!vehicle) {
    return <Navigate to="/vehicles" replace />;
  }

  // Determine current child page for breadcrumbs
  const isSettings = location.pathname.endsWith("/settings");
  const isAddLog = location.pathname.endsWith("/add-log") || location.pathname.includes("/add-log?");
  // Edit log path is /vehicles/:id/logs/:logId/edit
  const isEditLog = matchPath({ path: "/vehicles/:vehicleId/logs/:logId/edit" }, location.pathname);

  // If data is loaded successfully, render the common layout and the child route
  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-6">
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink asChild>
              <Link to="/vehicles">Vehicles</Link>
            </BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem>
            {/* If we are on a child page, this should be a link. If we are on the root dashboard, it's the page. */}
            {serviceTypeId || isSettings || isAddLog || isEditLog ? (
              <BreadcrumbLink asChild>
                <Link to={`/vehicles/${vehicleId}`}>
                  {vehicle.make} {vehicle.model}
                </Link>
              </BreadcrumbLink>
            ) : (
              <BreadcrumbPage>
                {vehicle.make} {vehicle.model}
              </BreadcrumbPage>
            )}
          </BreadcrumbItem>

          {/* Dynamic Child Crumbs */}
          {serviceType && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>{serviceType.name} History</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}

          {isSettings && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Settings</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}

          {isAddLog && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Add Log</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}

          {isEditLog && (
            <>
              <BreadcrumbSeparator />
              <BreadcrumbItem>
                <BreadcrumbPage>Edit Log</BreadcrumbPage>
              </BreadcrumbItem>
            </>
          )}
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-col sm:flex-row justify-between sm:items-start gap-4">
        <div className="flex items-center gap-4">
          <Car className="h-9 w-9 text-primary flex-shrink-0" />
          <div>
            <h1 className="text-3xl font-bold">
              <Link to={`/vehicles/${vehicleId}`}>
                {vehicle.make} {vehicle.model}
              </Link>
            </h1>
            <p className="text-muted-foreground">
              {vehicle.year} &bull; VIN: {vehicle.vin || "N/A"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button size="lg" asChild>
            <Link to="add-log">
              <PlusCircle className="mr-2 h-5 w-5" />
              Add Log
            </Link>
          </Button>
          {!isSettings && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="lg" className="px-3">
                  <MoreHorizontal className="h-5 w-5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to="settings">
                    <Settings className="mr-2 h-4 w-4" />
                    Vehicle Settings
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </header>

      {/* The child route will be rendered here, and we pass the vehicle data down */}
      <main>
        <Outlet context={{ vehicle } satisfies VehicleDetailContext} />
      </main>
    </div>
  );
}
