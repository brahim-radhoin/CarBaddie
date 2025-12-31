import { useMemo, useState, ChangeEvent } from "react";
import { useVehicles } from "../api";
import { VehicleCard } from "../components/VehicleCard";
import { useNavigate } from "react-router-dom";

// shadcn/ui components
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card"; // Card uses `var(--card)` etc.
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input"; // Input uses `var(--input)`
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
// import { Separator } from "@/components/ui/separator"; // Not used in this version, but available

// lucide-react icons
import { Plus, Car, List, AlertTriangle, Search, SortAsc, SortDesc, Clock } from "lucide-react";

// Define sort options (remains the same)
type SortOption = "make_asc" | "make_desc" | "model_asc" | "model_desc" | "newest" | "oldest";
const sortOptions: { value: SortOption; label: string; icon?: JSX.Element }[] = [
  { value: "newest", label: "Date Added (Newest)", icon: <Clock className="mr-2 h-4 w-4" /> },
  { value: "oldest", label: "Date Added (Oldest)", icon: <Clock className="mr-2 h-4 w-4 opacity-70" /> },
  { value: "make_asc", label: "Make (A-Z)", icon: <SortAsc className="mr-2 h-4 w-4" /> },
  { value: "make_desc", label: "Make (Z-A)", icon: <SortDesc className="mr-2 h-4 w-4" /> },
  { value: "model_asc", label: "Model (A-Z)", icon: <SortAsc className="mr-2 h-4 w-4" /> },
  { value: "model_desc", label: "Model (Z-A)", icon: <SortDesc className="mr-2 h-4 w-4" /> },
];

export function VehicleList() {
  const { data: allVehicles = [], isLoading, error } = useVehicles();
  const navigate = useNavigate();

  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("newest");

  const filteredAndSortedVehicles = useMemo(() => {
    let processedVehicles = [...allVehicles];
    if (searchTerm) {
      const lowerSearchTerm = searchTerm.toLowerCase();
      processedVehicles = processedVehicles.filter(
        (vehicle) =>
          vehicle.make.toLowerCase().includes(lowerSearchTerm) ||
          vehicle.model.toLowerCase().includes(lowerSearchTerm) ||
          (vehicle.vin && vehicle.vin.toLowerCase().includes(lowerSearchTerm))
      );
    }
    switch (sortBy) {
      case "make_asc":
        processedVehicles.sort((a, b) => a.make.localeCompare(b.make));
        break;
      case "make_desc":
        processedVehicles.sort((a, b) => b.make.localeCompare(a.make));
        break;
      case "model_asc":
        processedVehicles.sort((a, b) => a.model.localeCompare(b.model));
        break;
      case "model_desc":
        processedVehicles.sort((a, b) => b.model.localeCompare(a.model));
        break;
      case "newest":
        processedVehicles.sort((a, b) => b.id - a.id);
        break;
      case "oldest":
        processedVehicles.sort((a, b) => a.id - b.id);
        break;
      default:
        processedVehicles.sort((a, b) => b.id - a.id);
    }
    return processedVehicles;
  }, [allVehicles, searchTerm, sortBy]);

  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };
  const handleSortChange = (value: string) => {
    setSortBy(value as SortOption);
  };

  const renderSkeletons = (count: number) => {
    return [...Array(count)].map((_, i) => (
      <Card key={i} className="overflow-hidden animate-pulse">
        <div className="p-5 pb-3 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <Skeleton className="h-6 w-3/4 bg-muted/50" /> {/* Use theme colors for skeleton */}
              <Skeleton className="h-4 w-1/2 bg-muted/50" />
            </div>
            <Skeleton className="h-6 w-6 rounded-full bg-muted/50" />
          </div>
          <Skeleton className="h-4 w-full pt-1 bg-muted/50" />
        </div>
        <Skeleton className="h-px w-full bg-border" /> {/* Use border color for separator */}
        <div className="p-3 flex justify-between items-center">
          <Skeleton className="h-8 w-20 bg-muted/50" />
          <Skeleton className="h-8 w-20 bg-muted/50" />
        </div>
      </Card>
    ));
  };

  return (
    <div className="space-y-6 md:space-y-8">
      {" "}
      {/* Adjusted overall vertical spacing if needed */}
      {/* Page Header */}
      <header className="flex flex-col gap-4 sm:flex-row sm:justify-between sm:items-center">
        <div className="flex items-center gap-3">
          <List className="h-7 w-7 text-primary sm:h-8 sm:w-8" />
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">My Vehicles</h1>
        </div>
        <Button size="default" onClick={() => navigate("/vehicles/new")} className="w-full sm:w-auto">
          <Plus className="mr-2 h-4 w-4 sm:h-5 sm:w-5" /> Add New Vehicle
        </Button>
      </header>
      {/* Filters and Sort Section */}
      {/* This div will use `var(--card)` for background due to `bg-card` and `var(--border)` for border */}
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 items-center p-4 border bg-card rounded-lg shadow-sm">
        <div className="relative w-full sm:flex-grow">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search make, model, VIN..."
            value={searchTerm}
            onChange={handleSearchChange}
            className="pl-9 w-full text-sm h-9" // Input uses `var(--input)` for border, `var(--background)` for bg
          />
        </div>
        <div className="w-full sm:w-auto sm:min-w-[220px]">
          <Select value={sortBy} onValueChange={handleSortChange}>
            <SelectTrigger className="w-full text-sm h-9">
              {" "}
              {/* Uses theme colors */}
              <SelectValue placeholder="Sort by..." />
            </SelectTrigger>
            <SelectContent>
              {" "}
              {/* Uses `var(--popover)` and `var(--popover-foreground)` */}
              {sortOptions.map((option) => (
                <SelectItem key={option.value} value={option.value} className="text-sm">
                  <div className="flex items-center">
                    {option.icon || <SortAsc className="mr-2 h-4 w-4 opacity-50" />}
                    {option.label}
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {/* Error Display (Alert will use theme variables) */}
      {error && (
        <Alert variant="destructive" className="mt-6">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error Loading Vehicles</AlertTitle>
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}
      {/* Vehicle Grid Section */}
      <section className={isLoading || (filteredAndSortedVehicles.length === 0 && !error) ? "mt-6" : ""}>
        {" "}
        {/* Conditional margin for visual flow */}
        {isLoading ? (
          <div className="grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{renderSkeletons(4)}</div>
        ) : filteredAndSortedVehicles.length === 0 && !error ? (
          <Card className="col-span-full mt-0 text-center py-12 md:py-16">
            {" "}
            {/* Removed mt-8 if section already has margin */}
            <CardHeader>
              <div className="mx-auto bg-secondary p-4 rounded-full w-fit mb-4">
                {searchTerm ? <Search className="h-12 w-12 text-muted-foreground" /> : <Car className="h-12 w-12 text-muted-foreground" />}
              </div>
              <CardTitle className="text-2xl">{searchTerm ? "No Vehicles Match Your Search" : "No Vehicles Yet"}</CardTitle>
              <CardDescription className="mt-2 text-base">
                {searchTerm
                  ? "Try adjusting your search term or clear the search."
                  : "Get started by adding your first vehicle to CarBaddie."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {searchTerm ? (
                <Button variant="outline" onClick={() => setSearchTerm("")}>
                  Clear Search
                </Button>
              ) : (
                <Button size="lg" onClick={() => navigate("/vehicles/new")}>
                  <Plus className="mr-2 h-5 w-5" />
                  Add Your First Vehicle
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:gap-6 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredAndSortedVehicles.map((vehicle) => (
              <VehicleCard key={vehicle.id} vehicle={vehicle} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
