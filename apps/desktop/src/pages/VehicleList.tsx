import { useMemo, useState } from "react";
import { splitGarage } from "@carbaddie/core";
import { useGarageOrder, useVehicles } from "../api";
import { VehicleCard } from "../components/VehicleCard";
import { ArrangeSheet, EmptyGarage, GarageCard, PartsSheet, type PartsTarget } from "../components/Garage";
import { useNavigate } from "react-router-dom";

// shadcn/ui components
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

// lucide-react icons
import { ArrowUpDown, Plus, Search } from "lucide-react";

type SortOption = "arranged" | "make_asc" | "make_desc" | "model_asc" | "model_desc" | "newest" | "oldest";
const sortOptions: { value: SortOption; label: string }[] = [
  { value: "arranged", label: "Your order" },
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "make_asc", label: "Make, A to Z" },
  { value: "make_desc", label: "Make, Z to A" },
  { value: "model_asc", label: "Model, A to Z" },
  { value: "model_desc", label: "Model, Z to A" },
];

export function VehicleList() {
  const { data: allVehicles = [], isLoading, error } = useVehicles();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("arranged");
  const [partsTarget, setPartsTarget] = useState<PartsTarget | null>(null);
  const [arranging, setArranging] = useState(false);
  const { data: order = [] } = useGarageOrder();

  // The deck is the phone's garage deck exactly (favourites, then unset vehicles by age, in the
  // order the user arranged): search and sort only apply to the vehicles below it.
  const garage = useMemo(() => splitGarage(allVehicles, order), [allVehicles, order]);
  const { deck, others } = garage;

  const filteredAndSortedVehicles = useMemo(() => {
    let result = [...others];
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
      case "arranged": break; // splitGarage already put them in the arranged order
      case "make_asc": result.sort((a, b) => a.make.localeCompare(b.make)); break;
      case "make_desc": result.sort((a, b) => b.make.localeCompare(a.make)); break;
      case "model_asc": result.sort((a, b) => a.model.localeCompare(b.model)); break;
      case "model_desc": result.sort((a, b) => b.model.localeCompare(a.model)); break;
      case "newest": result.sort((a, b) => b.id.localeCompare(a.id)); break;
      case "oldest": result.sort((a, b) => a.id.localeCompare(b.id)); break;
    }
    return result;
  }, [others, searchTerm, sortBy]);

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-4 border-b border-border">
        <div>
          <h1 className="text-xl font-medium tracking-tight text-foreground">
            Vehicles
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5">
            {allVehicles.length} vehicle{allVehicles.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex gap-2 self-start sm:self-auto">
          {allVehicles.length > 1 && (
            <Button variant="outline" onClick={() => setArranging(true)} className="h-8 px-3 text-xs font-medium gap-1.5">
              <ArrowUpDown className="h-3.5 w-3.5" />
              Arrange
            </Button>
          )}
          <Button
            onClick={() => navigate("/vehicles/new")}
            className="h-8 px-3 text-xs font-medium gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Add vehicle
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {[...Array(2)].map((_, i) => (
            <Skeleton key={i} className="h-96 rounded-xl" />
          ))}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4 text-xs text-destructive">
          Unable to load vehicles
        </div>
      ) : allVehicles.length === 0 ? (
        <EmptyGarage onAdd={() => navigate("/vehicles/new")} />
      ) : (
        <>
          {/* The garage deck: favourites as big cards with their outline, as on the phone */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
            {deck.map((vehicle) => (
              <GarageCard key={vehicle.id} vehicle={vehicle} onParts={setPartsTarget} />
            ))}
          </div>

          {others.length > 0 && (
            <section className="space-y-3">
              <div className="flex flex-col gap-2.5 border-b border-border pb-3 sm:flex-row sm:items-center">
                <h2 className="text-sm font-medium text-foreground sm:flex-1">Other vehicles</h2>
                <div className="relative sm:w-64">
                  <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground opacity-60" />
                  <Input
                    placeholder="Search make, model or VIN"
                    aria-label="Search other vehicles"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="h-8 bg-card pl-8 text-xs"
                  />
                </div>
                <div className="sm:w-48">
                  <Select value={sortBy} onValueChange={(val) => setSortBy(val as SortOption)}>
                    <SelectTrigger className="h-8 bg-card text-xs" aria-label="Sort other vehicles">
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

              {filteredAndSortedVehicles.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-8 text-center text-xs text-muted-foreground">
                  No vehicles match your search
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                  {filteredAndSortedVehicles.map((vehicle) => (
                    <VehicleCard key={vehicle.id} vehicle={vehicle} />
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      )}

      <PartsSheet target={partsTarget} onClose={() => setPartsTarget(null)} />
      <ArrangeSheet garage={garage} open={arranging} onClose={() => setArranging(false)} />
    </div>
  );
}
