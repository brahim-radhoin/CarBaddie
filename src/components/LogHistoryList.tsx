import { useState, useMemo, ChangeEvent, useEffect } from "react";
import { MaintenanceLogRead } from "../types";
import { LogCard } from "./LogCard"; // Assuming LogCard is in the same components folder
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile } from "@tauri-apps/plugin-fs";

// shadcn/ui components
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Skeleton } from "@/components/ui/skeleton";

// lucide-react icons
import { Search, ListChecks, ChevronLeft, ChevronRight, History, XCircle, PlusCircle, Download, Info } from "lucide-react";
import { useNavigate } from "react-router-dom";
import Papa from "papaparse";
import { toast } from "sonner";

interface LogHistoryListProps {
  allLogs: MaintenanceLogRead[];
  vehicleName: string;
  isLoading: boolean;
  onDeleteLog: (logId: number) => Promise<void>;
  vehicleId: string; // Needed for "Add First Log" if list is empty
  externalDateFilter: string | null; // New prop
  onClearExternalDateFilter: () => void; // New prop
}

const ITEMS_PER_PAGE = 5; // Or your preferred number

export function LogHistoryList({
  allLogs,
  vehicleName,
  isLoading,
  onDeleteLog,
  vehicleId,
  externalDateFilter,
  onClearExternalDateFilter,
}: LogHistoryListProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const navigate = useNavigate(); // If needed for "Add First Log"

  // Reset current page to 1 if the external date filter changes OR if search term changes
  useEffect(() => {
    setCurrentPage(1);
  }, [externalDateFilter, searchTerm]);

  const filteredLogs = useMemo(() => {
    let processedLogs = [...allLogs];
    // Apply external date filter first if present
    if (externalDateFilter) {
      processedLogs = processedLogs.filter((log) => log.date.startsWith(externalDateFilter)); // Compare YYYY-MM-DD part
    }

    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      processedLogs = processedLogs.filter(
        (log) =>
          log.service_type?.name.toLowerCase().includes(lowerSearchTerm) ||
          (log.notes && log.notes.toLowerCase().includes(lowerSearchTerm)) ||
          log.custom_field_values.some(
            (cfv) => cfv.custom_field.name.toLowerCase().includes(lowerSearchTerm) || cfv.value.toLowerCase().includes(lowerSearchTerm)
          )
      );
    }
    return processedLogs;
  }, [allLogs, searchTerm, externalDateFilter]);

  const paginatedLogs = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredLogs.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredLogs, currentPage]);

  const totalPages = Math.ceil(filteredLogs.length / ITEMS_PER_PAGE);

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
    // setCurrentPage(1); // Reset to first page on new search
  };

  const renderSkeletons = (count: number) => {
    return [...Array(count)].map((_, i) => <Skeleton key={i} className="h-36 rounded-lg" />);
  };

  const handleExportCSV = async () => {
    if (allLogs.length === 0) {
      toast.info("No maintenance logs to export.");
      return;
    }

    try {
      const customFieldHeaders = new Set<string>();
      allLogs.forEach((log) => {
        if (log.custom_field_values) {
          // Check if the array exists
          log.custom_field_values.forEach((cfv) => {
            if (cfv.custom_field && cfv.custom_field.name) {
              // Check for nested objects
              customFieldHeaders.add(cfv.custom_field.name);
            }
          });
        }
      });

      // Convert the Set to a sorted array for consistent column order
      const sortedCustomHeaders = Array.from(customFieldHeaders).sort();

      // 2. Now, map each log to a flat object, ensuring all possible columns are present.
      const dataForCSV = allLogs.map((log) => {
        // Start with the base, static columns
        const row: Record<string, string | number> = {
          Date: log.date,
          "Service Type": log.service_type?.name || "Uncategorized",
          "Mileage (km)": log.mileage,
          "Cost (TND)": log.cost, // Assuming this is now a number
          Notes: log.notes || "",
        };

        // Create a quick lookup map of this log's custom values by field name
        const logCustomValues = new Map<string, string>();
        if (log.custom_field_values) {
          log.custom_field_values.forEach((cfv) => {
            if (cfv.custom_field && cfv.custom_field.name) {
              logCustomValues.set(cfv.custom_field.name, cfv.value);
            }
          });
        }

        // Populate the dynamic custom field columns for this row.
        // If a log doesn't have a value for a specific custom field, it will be an empty string.
        sortedCustomHeaders.forEach((header) => {
          row[header] = logCustomValues.get(header) || ""; // Use empty string for missing values
        });

        return row;
      });

      // 3. Unparse and save with Tauri
      if (dataForCSV.length === 0) {
        toast.error("Could not process data for export.");
        return;
      }

      const csv = Papa.unparse(dataForCSV);

      const safeVehicleName = (vehicleName || "vehicle").replace(/[^a-z0-9]/gi, "_").toLowerCase();
      const timestamp = new Date().toISOString().slice(0, 10);

      // Show native save dialog
      const filePath = await save({
        defaultPath: `${safeVehicleName}_maintenance_history_${timestamp}.csv`,
        filters: [
          {
            name: "CSV",
            extensions: ["csv"],
          },
        ],
      });

      // User canceled
      if (!filePath) {
        return;
      }

      // Write file
      await writeTextFile(filePath, csv);

      toast.success("Maintenance history exported successfully!");
    } catch (error) {
      console.error("Failed to export CSV:", error);
      toast.error(`Failed to export CSV: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  if (isLoading && allLogs.length === 0) {
    // Show skeletons only on initial load when allLogs is empty
    return <div className="space-y-4 animate-pulse">{renderSkeletons(3)}</div>;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-center gap-2">
        <div className="flex items-center gap-2">
          <History className="h-6 w-6 text-primary" />
          <h2 className="text-2xl font-semibold tracking-tight">
            {externalDateFilter
              ? `Logs for ${new Date(externalDateFilter + "T00:00:00").toLocaleDateString()}` // Add T00:00:00 to ensure correct date parsing if only YYYY-MM-DD
              : "Full Maintenance History"}
          </h2>
        </div>

        <div className="flex w-full sm:w-auto items-center gap-2">
          <div className="flex w-full sm:w-auto gap-2">
            {/* Search Input can go here */}
            <Button variant="outline" onClick={handleExportCSV} disabled={allLogs.length === 0}>
              <Download className="mr-2 h-4 w-4" /> Export as CSV
            </Button>
          </div>
          <TooltipProvider>
            <Tooltip delayDuration={200}>
              {" "}
              {/* Add a small delay */}
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-foreground">
                  <Info className="h-4 w-4" />
                  <span className="sr-only">About exporting data</span>
                </Button>
              </TooltipTrigger>
              <TooltipContent side="bottom" align="end" className="max-w-xs text-sm">
                <p className="font-semibold mb-1">About Exporting Data</p>
                <p className="text-muted-foreground">
                  This will export the vehicle's entire maintenance history to a CSV file. The file will include standard log details and
                  any associated custom fields as separate columns.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  <strong>Limitation:</strong> Currently, this does not include file attachments (e.g., invoices).
                </p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {externalDateFilter && (
          <Button variant="outline" size="sm" onClick={onClearExternalDateFilter}>
            <XCircle className="mr-2 h-4 w-4" /> Clear Date Filter
          </Button>
        )}
      </div>

      {/* Search Bar for Logs */}
      {(allLogs.length > 0 || searchTerm || externalDateFilter) && ( // Show search if there are logs or if a search term exists
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search logs (service, notes, details)..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="pl-9 text-sm h-9"
          />
        </div>
      )}

      {/* Log List */}
      {paginatedLogs.length > 0 ? (
        <div className="space-y-4">
          {/* Use space-y for cards */}
          {paginatedLogs.map((log) => (
            <LogCard key={log.id} log={log} onDelete={onDeleteLog} />
          ))}
        </div>
      ) : (
        !isLoading && ( // Only show empty states if not loading
          <Card className="text-center py-10">
            <CardHeader>
              <div className="mx-auto bg-secondary p-3 rounded-full w-fit">
                {searchTerm || externalDateFilter ? (
                  <Search className="h-10 w-10 text-muted-foreground" />
                ) : (
                  <ListChecks className="h-10 w-10 text-muted-foreground" />
                )}
              </div>
              <CardTitle className="mt-4 text-xl text-muted-foreground">
                {searchTerm || externalDateFilter ? "No Logs Match Filters" : "No Logs Yet"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <CardDescription>
                {searchTerm
                  ? "Try a different search term or clear filters."
                  : externalDateFilter
                  ? "No logs found for the selected date."
                  : "No maintenance logs recorded for this vehicle."}
              </CardDescription>
              {!searchTerm &&
                vehicleId && ( // Show "Add First Log" only if not searching and vehicleId is present
                  <Button onClick={() => navigate(`/vehicles/${vehicleId}/add-log`)} className="mt-6">
                    <PlusCircle className="mr-2 h-4 w-4" /> Add First Log
                  </Button>
                )}
            </CardContent>
          </Card>
        )
      )}

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center space-x-2 pt-4">
          <Button variant="outline" size="sm" onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))} disabled={currentPage === 1}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {currentPage} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setCurrentPage((prev) => Math.min(totalPages, prev + 1))}
            disabled={currentPage === totalPages}
          >
            Next <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
        </div>
      )}
    </section>
  );
}
