import { useDeleteVehicle } from "../api"; // Adjust path if needed
import { useNavigate } from "react-router-dom"; // Import for navigation

// UI Components & Icons
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
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
import { Alert, AlertTitle, AlertDescription as UiAlertDescription } from "@/components/ui/alert";
import { Trash2, Loader2, AlertTriangle } from "lucide-react";
import { AxiosError } from "axios";

interface DeleteVehicleSectionProps {
  vehicleId: number;
  vehicleName: string;
}

export function DeleteVehicleSection({ vehicleId, vehicleName }: DeleteVehicleSectionProps) {
  const navigate = useNavigate();
  
  // The mutation hook now handles all side effects (API call, cache invalidation, toasts).
  const { mutate: deleteVehicle, isPending, isError, error } = useDeleteVehicle();

  const handleDelete = () => {
    // We only need to provide the vehicleId.
    // The onSuccess/onError logic is now centralized in api.ts.
    deleteVehicle(vehicleId, {
      onSuccess: () => {
        // After a successful deletion, navigate back to the main vehicle list.
        navigate("/vehicles");
      },
    });
  };

  return (
    <Card className="border-destructive">
      <CardHeader>
        <CardTitle className="text-destructive">Danger Zone</CardTitle>
        <CardDescription>
          This action is permanent and cannot be undone. All associated data will be deleted.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* The error display is cleaner. It only shows up if there is an error. */}
        {isError && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Deletion Error</AlertTitle>
            <UiAlertDescription>
              {(error as AxiosError<{detail: string}>)?.response?.data?.detail || "An unexpected error occurred."}
            </UiAlertDescription>
          </Alert>
        )}
        <p>
          If you are absolutely sure you want to delete <strong>{vehicleName}</strong>, confirm below.
        </p>
      </CardContent>
      <CardFooter className="border-t border-destructive/30 pt-4">
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button variant="destructive" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
              Delete {vehicleName}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
              <AlertDialogDescription>
                This will permanently remove the vehicle <strong>{vehicleName}</strong> and all of its maintenance history. This action cannot be undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isPending}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                disabled={isPending}
                className="bg-destructive hover:bg-destructive/90"
              >
                {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Yes, delete this vehicle
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardFooter>
    </Card>
  );
}