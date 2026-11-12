import { useDeleteVehicle } from "../api";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Trash2 } from "lucide-react";
import { AxiosError } from "axios";
import { HoldToConfirm } from "@/components/interior/hold-to-confirm";

interface DeleteVehicleSectionProps {
  vehicleId: number;
  vehicleName: string;
}

export function DeleteVehicleSection({ vehicleId, vehicleName }: DeleteVehicleSectionProps) {
  const navigate = useNavigate();
  const { mutate: deleteVehicle, isPending, isError, error } = useDeleteVehicle();

  const handleDelete = () => {
    deleteVehicle(vehicleId, {
      onSuccess: () => {
        navigate("/vehicles");
      },
    });
  };

  return (
    <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 space-y-4">
      <div>
        <h3 className="text-sm font-medium text-destructive">
          Permanently Delete Vehicle
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Remove {vehicleName} and all associated maintenance logs, interval overrides, and telemetry records from the database.
        </p>
      </div>

      {isError && (
        <div className="rounded border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
          {(error as AxiosError<{ detail: string }>)?.response?.data?.detail || "An error occurred during deletion."}
        </div>
      )}

      <div className="pt-2 flex justify-start">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" size="sm" disabled={isPending} className="h-8 text-xs px-3">
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
              Delete {vehicleName}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent className="text-xs">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-sm font-semibold">Delete {vehicleName}?</AlertDialogTitle>
              <AlertDialogDescription className="text-xs text-muted-foreground">
                This action is irreversible. All maintenance history, custom field entries, and interval schedules will be destroyed.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex items-center justify-between gap-3 pt-3">
              <AlertDialogCancel className="h-8 text-xs">Cancel</AlertDialogCancel>
              <HoldToConfirm
                onConfirm={handleDelete}
                confirmLabel="Deleting Vehicle..."
                duration={2000}
                tone="destructive"
                className="h-8 text-xs"
              >
                Hold to Delete Vehicle
              </HoldToConfirm>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}
