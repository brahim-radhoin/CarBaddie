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
import { ServiceEventRead } from "@/types";
import { Calendar, Edit3, Gauge, MoreHorizontal, Store, Trash2 } from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useUnits } from "../hooks/useUnits";
import { LogCard } from "./LogCard";

interface VisitCardProps {
  visit: ServiceEventRead;
  onDeleteLog: (logId: string) => Promise<void>;
  onDeleteVisit: (visitId: string) => Promise<void>;
}

/** A garage visit with its services and total. A log recorded on its own shows as a plain LogCard. */
export function VisitCard({ visit, onDeleteLog, onDeleteVisit }: VisitCardProps) {
  const navigate = useNavigate();
  const units = useUnits();
  const [isDeleting, setIsDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (visit.standalone && visit.items.length === 1) {
    return <LogCard log={visit.items[0]} onDelete={onDeleteLog} />;
  }

  const displayDate = new Date(visit.date).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

  const confirmDelete = async () => {
    setIsDeleting(true);
    try {
      await onDeleteVisit(visit.id);
    } catch (error) {
      console.error("Failed to delete visit:", error);
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
            {visit.items.map((item) => item.service_type?.name ?? "General Maintenance").join(" + ") || "Garage Visit"}
          </h4>
          <div className="flex flex-wrap items-center gap-3 mt-1.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1 font-mono">
              <Calendar className="h-3 w-3 opacity-60" />
              {displayDate}
            </span>
            <span className="opacity-30">/</span>
            <span className="flex items-center gap-1 font-mono">
              <Gauge className="h-3 w-3 opacity-60" />
              {units.distance(visit.mileage)}
            </span>
            {visit.shop && (
              <>
                <span className="opacity-30">/</span>
                <span className="flex items-center gap-1">
                  <Store className="h-3 w-3 opacity-60" />
                  {visit.shop}
                </span>
              </>
            )}
            <span className="opacity-30">/</span>
            <span className="flex items-center gap-1 font-mono font-medium text-foreground">{units.money(visit.total_cost_cents)}</span>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 rounded text-muted-foreground hover:text-foreground">
              <MoreHorizontal className="h-3.5 w-3.5" />
              <span className="sr-only">Actions</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="text-xs">
            <DropdownMenuItem onClick={() => navigate(`/vehicles/${visit.vehicle_id}/visits/${visit.id}/edit`)}>
              <Edit3 className="mr-2 h-3.5 w-3.5 opacity-70" />
              Edit Visit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setShowDeleteConfirm(true)}>
              <Trash2 className="mr-2 h-3.5 w-3.5 opacity-70" />
              Delete Visit
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Services of the visit */}
      <div className="mt-2.5 pt-2 border-t border-border/40 space-y-2">
        {visit.items.map((item) => (
          <div key={item.id} className="text-xs">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-foreground">{item.service_type?.name ?? "General Maintenance"}</span>
              <span className="font-mono text-muted-foreground">{units.money(item.cost_cents)}</span>
            </div>
            {item.notes && <p className="mt-0.5 text-muted-foreground leading-relaxed">{item.notes}</p>}
            {item.custom_field_values.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-1">
                {item.custom_field_values.map((cf) => (
                  <span
                    key={cf.id}
                    className="font-mono text-[11px] px-2 py-0.5 rounded bg-secondary text-muted-foreground border border-border"
                  >
                    {cf.custom_field?.name ?? "Field"}: {cf.value} {cf.custom_field?.unit ?? ""}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {visit.notes && (
        <p className="mt-2.5 text-xs text-muted-foreground leading-relaxed pt-2 border-t border-border/40">{visit.notes}</p>
      )}

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent className="text-xs">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-sm font-semibold">Delete this visit?</AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-muted-foreground">
              This action cannot be undone. The visit and its {visit.items.length} service records will be removed from your logs.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="h-8 text-xs">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              disabled={isDeleting}
              className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? "Deleting..." : "Delete Visit"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
