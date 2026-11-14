import { VehicleRead } from "../types";
import { useDeleteOdometerReading } from "../api";
import { useUnits } from "../hooks/useUnits";
import { UpdateOdometerPopover } from "./UpdateOdometerPopover";

import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";

interface OdometerReadingsSectionProps {
  vehicle: VehicleRead;
}

/** The vehicle's manual odometer readings (newest first), with delete. */
export function OdometerReadingsSection({ vehicle }: OdometerReadingsSectionProps) {
  const units = useUnits();
  const { mutate: deleteReading, isPending } = useDeleteOdometerReading();
  const readings = vehicle.odometer_readings;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-medium text-foreground">Odometer Readings</h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Current odometer: {vehicle.current_mileage != null ? units.distance(vehicle.current_mileage) : "unknown"} (the
            highest of the starting odometer, service logs and these readings).
          </p>
        </div>
        <UpdateOdometerPopover vehicleId={vehicle.id} currentMileage={vehicle.current_mileage} />
      </div>

      {readings.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-6 text-center text-xs text-muted-foreground">
          No odometer readings yet. Use "Update" to note the mileage between services.
        </div>
      ) : (
        <div className="rounded-lg border border-border divide-y divide-border">
          {readings.map((reading) => (
            <div key={reading.id} className="flex items-center justify-between gap-3 px-3 py-2 text-xs">
              <div className="flex items-center gap-4 min-w-0">
                <span className="font-mono text-muted-foreground flex-shrink-0">{reading.date}</span>
                <span className="font-mono font-medium text-foreground flex-shrink-0">{units.distance(reading.mileage)}</span>
                {reading.note && <span className="text-muted-foreground truncate">{reading.note}</span>}
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                    disabled={isPending}
                    aria-label={`Delete reading of ${reading.date}`}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent className="text-xs">
                  <AlertDialogHeader>
                    <AlertDialogTitle className="text-sm font-semibold">Delete this odometer reading?</AlertDialogTitle>
                    <AlertDialogDescription className="text-xs text-muted-foreground">
                      {units.distance(reading.mileage)} on {reading.date} will be removed on every synced device.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="pt-3">
                    <AlertDialogCancel className="h-8 text-xs">Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      className="h-8 text-xs"
                      onClick={() => deleteReading({ readingId: reading.id, vehicleId: vehicle.id })}
                    >
                      Delete
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
