// Which vehicles are on the garage deck and which are in the list above it.
//
// `is_favorite` is NULL until the user chooses. NULL has to resolve the same on every device or
// the phone and the desktop would show different decks, so it is derived only from the vehicles
// themselves: unset vehicles fill the free deck places in creation order (ids are UUIDv7, so
// ordering by id is ordering by creation).

export const DECK_SIZE = 3;

export interface GarageVehicle {
  id: string;
  is_favorite?: boolean | null;
}

export interface Garage<T> {
  /** Shown as big cards. Never empty while there is a vehicle. */
  deck: T[];
  /** Everything else, for the compact list. */
  others: T[];
}

export function splitGarage<T extends GarageVehicle>(vehicles: readonly T[], deckSize = DECK_SIZE): Garage<T> {
  const byId = [...vehicles].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const chosen = byId.filter((v) => v.is_favorite === true);
  const freePlaces = Math.max(0, deckSize - chosen.length);
  const unset = byId.filter((v) => v.is_favorite == null).slice(0, freePlaces);
  const onDeck = new Set([...chosen, ...unset].map((v) => v.id));
  const deck = byId.filter((v) => onDeck.has(v.id));
  const others = byId.filter((v) => !onDeck.has(v.id));
  if (deck.length === 0 && others.length > 0) deck.push(others.shift()!);
  return { deck, others };
}
