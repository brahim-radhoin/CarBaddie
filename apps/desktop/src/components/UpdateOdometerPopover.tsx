import { useState, FormEvent } from "react";
import { ValidationError } from "@carbaddie/core";
import { useAddOdometerReading } from "../api";
import { useUnits } from "../hooks/useUnits";
import { cn } from "@/lib/utils";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Gauge } from "lucide-react";

/** Today as "YYYY-MM-DD" in local time. */
const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

interface UpdateOdometerPopoverProps {
  vehicleId: string;
  /** Highest known mileage in km, shown as the placeholder. */
  currentMileage: number | null;
}

/** Records an odometer reading (date + mileage typed in the user's unit + optional note). */
export function UpdateOdometerPopover({ vehicleId, currentMileage }: UpdateOdometerPopoverProps) {
  const units = useUnits();
  const { mutate: addReading, isPending, error } = useAddOdometerReading();
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(localToday);
  const [mileage, setMileage] = useState("");
  const [note, setNote] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const fieldErrors = error instanceof ValidationError ? error.fieldErrors : {};

  const reset = () => {
    setDate(localToday());
    setMileage("");
    setNote("");
    setLocalError(null);
  };

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    const typed = Number(mileage);
    if (!mileage.trim() || !Number.isFinite(typed) || typed < 0) {
      setLocalError(`Enter the odometer in ${units.unit}.`);
      return;
    }
    setLocalError(null);
    addReading(
      { vehicleId, reading: { date, mileage: units.fromDisplay(typed), note: note.trim() || null } },
      {
        onSuccess: () => {
          setOpen(false);
          reset();
        },
      },
    );
  };

  const mileageError = localError ?? fieldErrors.mileage?.[0];

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-6 px-1.5 text-[11px] gap-1 text-muted-foreground hover:text-foreground">
          <Gauge className="h-3 w-3" />
          Update
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-4">
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <h3 className="text-sm font-medium text-foreground">Update odometer</h3>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Note the mileage between services so due dates stay accurate.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="odometer_mileage" className="text-xs font-medium text-muted-foreground">
              Odometer ({units.unit})
            </Label>
            <Input
              id="odometer_mileage"
              type="number"
              min={0}
              inputMode="numeric"
              autoFocus
              value={mileage}
              onChange={(e) => setMileage(e.target.value)}
              placeholder={currentMileage != null ? String(units.toDisplay(currentMileage)) : "e.g. 55000"}
              className={cn("h-8 text-xs font-mono bg-background", mileageError && "border-destructive")}
            />
            {mileageError && <p className="text-[11px] text-destructive">{mileageError}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="odometer_date" className="text-xs font-medium text-muted-foreground">
              Date
            </Label>
            <Input
              id="odometer_date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className={cn("h-8 text-xs font-mono bg-background", fieldErrors.date && "border-destructive")}
            />
            {fieldErrors.date && <p className="text-[11px] text-destructive">{fieldErrors.date[0]}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="odometer_note" className="text-xs font-medium text-muted-foreground">
              Note (optional)
            </Label>
            <Input
              id="odometer_note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-8 text-xs bg-background"
            />
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" size="sm" className="h-7 text-xs" disabled={isPending}>
              {isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  );
}
