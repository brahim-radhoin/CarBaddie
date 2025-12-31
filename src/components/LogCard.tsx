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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Separator } from "@/components/ui/separator";
import { MaintenanceLogRead as MaintenanceLog } from "@/types"; // Use MaintenanceLogRead
import { CalendarDays, DollarSign, Edit3, Gauge, Loader2, MoreHorizontal, Tag, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";

interface LogCardProps {
  log: MaintenanceLog;
  onDelete: (logId: number) => Promise<void>; // Callback to parent after successful delete
  // onEdit?: (logId: number) => void; // You'd add this for edit functionality
}

export function LogCard({ log, onDelete }: LogCardProps) {
  const navigate = useNavigate();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const displayDate = log.date
    ? new Date(log.date).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "N/A";

  const handleEdit = () => {
    // Ensure log.vehicle_id is available if needed for the route
    navigate(`/vehicles/${log.vehicle_id}/logs/${log.id}/edit`);
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      // API call is handled by the parent via onDelete prop
      await onDelete(log.id);
      // Success toast/message can be handled by parent or here if desired
    } catch (error) {
      // Error handling (e.g., toast) should ideally be managed by the parent
      // or a global error handler, as LogCard doesn't know the broader context.
      console.error("Failed to delete log from LogCard:", error);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false); // Close the dialog
    }
  };

  return (
    <Card className="hover:shadow-lg transition-shadow w-full">
      <CardHeader className="pb-3">
        <div className="flex justify-between items-start gap-2">
          <CardTitle className="text-xl leading-tight">{log.service_type ? log.service_type.name : "General Maintenance"}</CardTitle>
          {/* Actions Dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8 data-[state=open]:bg-muted flex-shrink-0">
                <MoreHorizontal className="h-4 w-4" />
                <span className="sr-only">Log Actions</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={handleEdit} className="flex items-center">
                <Edit3 className="mr-2 h-3.5 w-3.5 text-muted-foreground" /> Edit
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
                <AlertDialogTrigger asChild>
                  <DropdownMenuItem
                    onSelect={(e) => e.preventDefault()} // Prevent dropdown from closing
                    className="flex items-center text-destructive focus:bg-destructive/10 focus:text-destructive"
                    disabled={isDeleting}
                  >
                    {isDeleting ? <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" /> : <Trash2 className="mr-2 h-3.5 w-3.5" />}
                    Delete
                  </DropdownMenuItem>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. This will permanently delete this maintenance log.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={confirmDelete} disabled={isDeleting} className="bg-destructive hover:bg-destructive/90">
                      {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Yes, delete log
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground pt-1">
          <span className="flex items-center">
            <CalendarDays className="mr-1 h-3 w-3" />
            {displayDate}
          </span>
          <span className="flex items-center">
            <Gauge className="mr-1 h-3 w-3" /> {log.mileage.toLocaleString()} km
          </span>
          <span className="flex items-center">
            <DollarSign className="mr-1 h-3 w-3" /> {log.cost.toFixed(2)}
          </span>
        </div>
      </CardHeader>
      <CardContent className="pt-2 text-sm">
        {" "}
        {/* Adjusted pt */}
        {log.notes && (
          <>
            <p className="text-muted-foreground prose prose-sm max-w-none line-clamp-3">{log.notes}</p>
            {log.custom_field_values && log.custom_field_values.length > 0 && <Separator className="my-3" />}
          </>
        )}
        {log.custom_field_values && log.custom_field_values.length > 0 && (
          <div>
            <h4 className="text-xs font-semibold text-muted-foreground mb-1.5 uppercase tracking-wider">Details</h4>
            <ul className="space-y-1">
              {log.custom_field_values.map(
                (cfv) =>
                  cfv.custom_field && ( // Defensive check
                    <li key={cfv.id} className="text-xs text-foreground flex justify-between items-center">
                      <span className="flex items-center">
                        <Tag className="mr-1.5 h-3 w-3 text-muted-foreground" />
                        {cfv.custom_field.name}:
                      </span>
                      <span className="font-medium">
                        {cfv.value}
                        {cfv.custom_field.unit && ` ${cfv.custom_field.unit}`}
                      </span>
                    </li>
                  )
              )}
            </ul>
          </div>
        )}
        {!log.notes && (!log.custom_field_values || log.custom_field_values.length === 0) && (
          <p className="text-xs text-muted-foreground italic">No additional notes or details.</p>
        )}
      </CardContent>
    </Card>
  );
}
