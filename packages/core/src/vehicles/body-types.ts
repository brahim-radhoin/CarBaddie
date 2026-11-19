// What kind of vehicle it is, so the garage can draw a matching outline.
//
// The stored value is a plain string (`vehicles.body_type`), because a newer app may know more
// kinds than this one; an unknown value is kept as it is and only drawn as the default here.
// Adding a kind later needs art and an entry below, no schema change.

// Ids are stored and synced: never rename one. Labels can change. "car" is the default and is
// drawn as a hatchback; it keeps the plain label so a vehicle nobody has typed yet reads "Car".
export const BODY_TYPES = [
  { id: "car", label: "Car" },
  { id: "sedan", label: "Sedan" },
  { id: "estate", label: "Estate" },
  { id: "coupe", label: "Coupé" },
  { id: "suv", label: "SUV" },
  { id: "pickup", label: "Pickup" },
  { id: "motorbike", label: "Motorbike" },
  { id: "snowmobile", label: "Snowmobile" },
] as const;

export type BodyTypeId = (typeof BODY_TYPES)[number]["id"];

export const DEFAULT_BODY_TYPE: BodyTypeId = "car";

export function isBodyTypeId(value: unknown): value is BodyTypeId {
  return BODY_TYPES.some((t) => t.id === value);
}

const BIKE_MAKES = ["yamaha", "ducati", "harley", "kawasaki", "ktm", "vespa", "piaggio", "aprilia", "husqvarna", "royal enfield", "benelli", "mv agusta", "moto guzzi", "triumph motorcycles"];
const SNOWMOBILE_MAKES = ["arctic cat", "ski-doo", "ski doo", "skidoo", "lynx"];

const norm = (s: string) => s.trim().toLowerCase();

/** A suggestion from the make, for the form to start with. Never stored until the user saves. */
export function guessBodyType(make: string, _model = ""): BodyTypeId {
  const m = norm(make);
  if (SNOWMOBILE_MAKES.some((x) => m.includes(x))) return "snowmobile";
  if (BIKE_MAKES.some((x) => m.includes(x))) return "motorbike";
  return DEFAULT_BODY_TYPE;
}

/** The kind to draw for a stored value: known as stored, otherwise a guess from the make. */
export function drawableBodyType(stored: string | null | undefined, make: string): BodyTypeId {
  return isBodyTypeId(stored) ? stored : guessBodyType(make);
}
