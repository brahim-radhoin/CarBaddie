import { useMemo, useState } from "react";
import { useVehicles } from "../api";
import { VehicleCard } from "../components/VehicleCard";
import { useNavigate } from "react-router-dom";

// shadcn/ui components
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// lucide-react icons
import { Plus, Search, Car } from "lucide-react";

type SortOption = "make_asc" | "make_desc" | "model_asc" | "model_desc" | "newest" | "oldest";
const sortOptions: { value: SortOption; label: string }[] = [
  { value: "newest", label: "Date Added (Newest)" },
  { value: "oldest", label: "Date Added (Oldest)" },
  { value: "make_asc", label: "Make (A→Z)" },
  { value: "make_desc", label: "Make (Z→A)" },
  { value: "model_asc", label: "Model (A→Z)" },
  { value: "model_desc", label: "Model (Z→A)" },
];

export function VehicleList() {
  const { data: allVehicles = [], isLoading, error } = useVehicles();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const filteredAndSortedVehicles = useMemo(() => {
    let result = [...allVehicles];
    if (searchTerm) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(
        (v) =>
          v.make.toLowerCase().includes(lower) ||
          v.model.toLowerCase().includes(lower) ||
          (v.vin && v.vin.toLowerCase().includes(lower))
      );
    }
    switch (sortBy) {
      case "make_asc": result.sort((a, b) => a.make.localeCompare(b.make)); break;
      case "make_desc": result.sort((a, b) => b.make.localeCompare(a.make)); break;
      case "model_asc": result.sort((a, b) => a.model.localeCompare(b.model)); break;
      case "model_desc": result.sort((a, b) => b.model.localeCompare(a.model)); break;
      case "newest": result.sort((a, b) => b.id - a.id); break;
      case "oldest": result.sort((a, b) => a.id - b.id); break;
    }
    return result;
  }, [allVehicles, searchTerm, sortBy]);

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-medium tracking-tight text-foreground">
            Vehicle Fleet
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {allVehicles.length} vehicle{allVehicles.length !== 1 ? "s" : ""} registered in garage database
          </p>
        </div>
        <Button
          onClick={() => navigate("/vehicles/new")}
          className="h-8 px-3 text-xs font-medium gap-1.5 self-start sm:self-auto"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Vehicle
        </Button>
      </div>

      {/* Filter / Search Controls */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground opacity-60" />
          <Input
            placeholder="Search make, model, or VIN..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-8 text-xs bg-card"
          />
        </div>
        <div className="w-full sm:w-56">
          <Select value={sortBy} onValueChange={(val) => setSortBy(val as SortOption)}>
            <SelectTrigger className="h-8 text-xs bg-card">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              {sortOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value} className="text-xs">
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Main Grid View */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-xs text-destructive">
          Unable to load vehicles. Verify backend connection.
        </div>
      ) : filteredAndSortedVehicles.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-12 text-center">
          <div className="w-8 h-8 mx-auto rounded border border-border bg-muted/40 flex items-center justify-center text-muted-foreground mb-3">
            <Car className="h-4 w-4" />
          </div>
          <h3 className="text-sm font-medium text-foreground">
            {searchTerm ? "No vehicles match your search" : "No vehicles in database"}
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
            {searchTerm
              ? "Try adjusting your search criteria or clear the query to see all vehicles."
              : "Register your first vehicle to start tracking odometer readings, service intervals, and logs."}
          </p>
          {!searchTerm && (
            <Button
              onClick={() => navigate("/vehicles/new")}
              variant="outline"
              className="mt-4 h-8 text-xs gap-1.5"
            >
              <Plus className="h-3.5 w-3.5" />
              Add First Vehicle
            </Button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {filteredAndSortedVehicles.map((vehicle) => (
            <VehicleCard key={vehicle.id} vehicle={vehicle} />
          ))}
        </div>
      )}
    </div>
  );
}
