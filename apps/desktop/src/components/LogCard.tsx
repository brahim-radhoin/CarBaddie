import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { MaintenanceLogRead as MaintenanceLog } from "@/types";
import { Calendar, Edit3, Gauge, MoreHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUnits } from "../hooks/useUnits";

interface LogCardProps {
  log: MaintenanceLog;
  onDelete: (logId: string) => Promise<void>;
}

export function LogCard({ log, onDelete }: LogCardProps) {
  const navigate = useNavigate();
  const units = useUnits();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const displayDate = log.date
    ? new Date(log.date).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : "—";

  const handleEdit = () => {
    navigate(`/vehicles/${log.vehicle_id}/logs/${log.id}/edit`);
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      await onDelete(log.id);
    } catch (error) {
      console.error("Failed to delete log:", error);
    } finally {
      setIsDeleting(false);
      setShowDeleteConfirm(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-foreground/20">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-sm font-medium text-foreground leading-snug">
            {log.service_type ? log.service_type.name : "General Maintenance"}
          </h4>
          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 font-mono">
              <Calendar className="h-3 w-3 opacity-60" />
              {displayDate}
            </span>
            <span className="opacity-30">/</span>
            <span className="flex items-center gap-1 font-mono">
              <Gauge className="h-3 w-3 opacity-60" />
              {units.distance(log.mileage)}
            </span>
            <span className="opacity-30">/</span>
            <span className="flex items-center gap-1 font-mono font-medium text-foreground">
              {units.money(log.cost_cents)}
            </span>
          </div>
        </div>

        {/* Actions Dropdown */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded text-muted-foreground hover:text-foreground">
              <MoreHorizontal className="h-3.5 w-3.5" />
              <span className="sr-only">Actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem onClick={handleEdit}>
              <Edit3 className="mr-2 h-3.5 w-3.5 opacity-70" />
              Edit Record
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => setShowDeleteConfirm(true)}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5 opacity-70" />
              Delete Record
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Notes / Custom Field Values */}
      {log.notes && (
        <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed pt-2 border-t border-border/40">
          {log.notes}
        </p>
      )}

      {log.custom_field_values && log.custom_field_values.length > 0 && (
        <div className="flex flex-wrap gap-1.5 mt-2.5 pt-2 border-t border-border/40">
          {log.custom_field_values.map((cf) => (
            <span
              key={cf.id}
              className="font-mono text-[11px] px-2 py-0.5 rounded bg-secondary text-muted-foreground border border-border"
            >
              {cf.custom_field?.name ?? "Field"}: {cf.value} {cf.custom_field?.unit ?? ""}
            </span>
          ))}
        </div>
      )}

      {/* Delete Confirmation Alert Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="text-xs">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-semibold">Delete maintenance entry?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              This action cannot be undone. This service record will be removed from your logs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete Record"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
