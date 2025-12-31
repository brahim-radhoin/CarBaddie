import { VehicleRead as Vehicle } from "../types";
import { useNavigate } from "react-router-dom";

// shadcn/ui components
import { Card, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button"; // Corrected path if it's in ui directory
import { Separator } from "@/components/ui/separator"; // Optional for visual separation

// lucide-react icons
import { ArrowRight, Car, Edit } from "lucide-react";

interface VehicleCardProps {
  vehicle: Vehicle;
}

export function VehicleCard({ vehicle }: VehicleCardProps) {
  const navigate = useNavigate();

  // Main click action for the card content (excluding footer actions)
  const handleNavigateToMaintenance = () => {
    navigate(`/vehicles/${vehicle.id}`);
  };

  // Specific action for the edit button
  const handleNavigateToEdit = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent card's main click if this button is clicked
    navigate(`/vehicles/${vehicle.id}/edit`);
  };

  return (
    <Card className="flex flex-col h-full group transition-all hover:shadow-lg focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
      {/* Make the content area clickable */}
      <div
        onClick={handleNavigateToMaintenance}
        className="flex-grow cursor-pointer p-5 pb-3 space-y-2" // Combined CardHeader and CardContent padding
        role="button" // Semantics for clickability
        tabIndex={0} // Make it focusable
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleNavigateToMaintenance();
        }} // Keyboard accessibility
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <CardTitle className="text-lg leading-tight">
              {" "}
              {/* Adjusted leading */}
              {vehicle.make} {vehicle.model}
            </CardTitle>
            {vehicle.year && (
              <CardDescription className="text-sm text-muted-foreground">
                {" "}
                {/* Slightly larger description */}
                {vehicle.year}
              </CardDescription>
            )}
          </div>
          <Car className="h-6 w-6 text-primary opacity-80 group-hover:opacity-100 transition-opacity" />
        </div>

        {vehicle.vin ? (
          <p className="text-xs text-muted-foreground pt-1 break-all">
            VIN: <span className="font-mono">{vehicle.vin}</span> {/* Monospace for VIN */}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground italic pt-1">VIN not provided</p>
        )}
      </div>
      <Separator /> {/* Visually separate content from actions */}
      <CardFooter className="p-3 flex justify-between items-center">
        {" "}
        {/* Reduced padding for footer */}
        <Button variant="ghost" size="sm" onClick={handleNavigateToEdit} className="text-xs h-8">
          {" "}
          {/* Slightly taller button */}
          <Edit className="mr-1.5 h-3.5 w-3.5" /> Edit
        </Button>
        <Button
          variant="ghost" // Changed to ghost for less emphasis, or keep as link-like
          size="sm"
          onClick={handleNavigateToMaintenance}
          className="text-xs h-8 group/link text-muted-foreground hover:text-primary" // Group for specific hover on this link
        >
          Logs <ArrowRight className="ml-1.5 h-4 w-4 transition-transform group-hover/link:translate-x-0.5" />
        </Button>
      </CardFooter>
    </Card>
  );
}
