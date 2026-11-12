import { Link } from "react-router-dom";
import { useServiceTypes, useDeleteServiceType } from "../api";
import { ServiceTypeRead } from "../types";
import { AxiosError } from "axios";

// UI Components & Icons
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Plus, Edit, Trash2, MoreHorizontal, ChevronLeft } from "lucide-react";

export function ManageServiceTypesPage() {
  const { data: serviceTypes = [], isLoading, isError, error } = useServiceTypes();
  const { mutate: deleteServiceType, isPending: isDeleting } = useDeleteServiceType();

  const sortedServiceTypes = [...serviceTypes].sort((a, b) => a.name.localeCompare(b.name));

  if (isLoading) {
    return (
      <div className="max-w-4xl space-y-4">
        <Skeleton className="h-6 w-32" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="max-w-4xl space-y-4">
        <div className="rounded-lg border border-destructive/20 bg-destructive/10 p-4 text-xs text-destructive">
          {(error as AxiosError<{ detail: string }>)?.response?.data?.detail || "Could not fetch service types."}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl space-y-6">
      {/* Contextual Header */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground pb-4 border-b border-border">
        <Link to="/vehicles" className="hover:text-foreground transition-colors flex items-center gap-1">
          <ChevronLeft className="h-3.5 w-3.5" />
          <span>Overview</span>
        </Link>
        <span className="opacity-40">/</span>
        <span className="font-medium text-foreground">Service Types</span>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-medium tracking-tight text-foreground">
            Service Categories
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            Configure maintenance intervals, custom fields, and inter-service relationships.
          </p>
        </div>
        <Button asChild size="sm" className="h-8 px-3 text-xs gap-1.5 self-start sm:self-auto">
          <Link to="/service-types/new">
            <Plus className="h-3.5 w-3.5" />
            Add Category
          </Link>
        </Button>
      </div>

      {/* Categories Table / Data Grid */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-muted/40 border-b border-border text-muted-foreground font-medium">
              <tr>
                <th className="py-2.5 px-3.5">Category Name</th>
                <th className="py-2.5 px-3.5">Interval (km)</th>
                <th className="py-2.5 px-3.5">Interval (days)</th>
                <th className="py-2.5 px-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {sortedServiceTypes.length === 0 ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-muted-foreground">
                    No service categories configured yet.
                  </td>
                </tr>
              ) : (
                sortedServiceTypes.map((type: ServiceTypeRead) => (
                  <tr key={type.id} className="hover:bg-accent/20 transition-colors">
                    <td className="py-2.5 px-3.5 font-medium text-foreground">
                      {type.name}
                    </td>
                    <td className="py-2.5 px-3.5 font-mono text-muted-foreground">
                      {type.recommended_interval_km ? `${type.recommended_interval_km.toLocaleString()} km` : "—"}
                    </td>
                    <td className="py-2.5 px-3.5 font-mono text-muted-foreground">
                      {type.recommended_interval_days ? `${type.recommended_interval_days} days` : "—"}
                    </td>
                    <td className="py-2.5 px-3.5 text-right">
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 rounded text-muted-foreground hover:text-foreground">
                            <MoreHorizontal className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="text-xs">
                          <DropdownMenuItem asChild>
                            <Link to={`/service-types/${type.id}/edit`}>
                              <Edit className="mr-2 h-3.5 w-3.5 opacity-70" />
                              Edit
                            </Link>
                          </DropdownMenuItem>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <DropdownMenuItem
                                onSelect={(e) => e.preventDefault()}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 className="mr-2 h-3.5 w-3.5 opacity-70" />
                                Delete
                              </DropdownMenuItem>
                            </AlertDialogTrigger>
                            <AlertDialogContent className="text-xs">
                              <AlertDialogHeader>
                                <AlertDialogTitle className="text-sm font-semibold">Delete "{type.name}"?</AlertDialogTitle>
                                <AlertDialogDescription className="text-xs text-muted-foreground">
                                  This service category and its interval rules will be permanently deleted.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel className="h-8 text-xs">Cancel</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => deleteServiceType(type.id)}
                                  disabled={isDeleting}
                                  className="h-8 text-xs bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  {isDeleting ? "Deleting..." : "Delete"}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
