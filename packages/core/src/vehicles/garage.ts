// Which vehicles are on the garage deck and which are in the list above it, and in what order.
//
// `is_favorite` is NULL until the user chooses. NULL has to resolve the same on every device or
// the phone and the desktop would show different decks, so it is derived only from the vehicles
// themselves: unset vehicles fill the free deck places in creation order (ids are UUIDv7, so
// ordering by id is ordering by creation).
//
// The order the user arranged is a synced preference (`garage_order`, a list of vehicle ids). It
// only sorts the deck and the list; it never decides what is on the deck. Vehicles it doesn't
// name (new ones, or every vehicle before the user arranges anything) follow in creation order,
// and ids it names that are gone (deleted, merged) are skipped.

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

const byIdAsc = (a: GarageVehicle, b: GarageVehicle) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function splitGarage<T extends GarageVehicle>(
  vehicles: readonly T[],
  order: readonly string[] = [],
  deckSize = DECK_SIZE,
): Garage<T> {
  const byId = [...vehicles].sort(byIdAsc);
  const chosen = byId.filter((v) => v.is_favorite === true);
  const freePlaces = Math.max(0, deckSize - chosen.length);
  const unset = byId.filter((v) => v.is_favorite == null).slice(0, freePlaces);
  const onDeck = new Set([...chosen, ...unset].map((v) => v.id));
  // Never empty while there is a vehicle: the oldest goes up, whatever the order says.
  if (onDeck.size === 0 && byId.length > 0) onDeck.add(byId[0].id);
  const arranged = arrange(byId, order);
  return { deck: arranged.filter((v) => onDeck.has(v.id)), others: arranged.filter((v) => !onDeck.has(v.id)) };
}

/** The ids it names first, in its order; the rest after them by id. */
function arrange<T extends GarageVehicle>(byId: readonly T[], order: readonly string[]): T[] {
  const rank = new Map<string, number>();
  order.forEach((id, i) => {
    if (!rank.has(id)) rank.set(id, i);
  });
  const named = byId.filter((v) => rank.has(v.id)).sort((a, b) => rank.get(a.id)! - rank.get(b.id)!);
  return [...named, ...byId.filter((v) => !rank.has(v.id))];
}

/**
 * The order to save after moving one vehicle a place earlier (-1) or later (+1) within its group
 * (the deck or the list). Saving every vehicle, deck first, keeps what is shown exactly as shown.
 * Returns null when it can't move that way.
 */
export function moveInGarage(garage: Garage<GarageVehicle>, id: string, step: -1 | 1): string[] | null {
  const group = garage.deck.some((v) => v.id === id) ? [...garage.deck] : [...garage.others];
  const from = group.findIndex((v) => v.id === id);
  const to = from + step;
  if (from < 0 || to < 0 || to >= group.length) return null;
  [group[from], group[to]] = [group[to], group[from]];
  const deck = garage.deck.some((v) => v.id === id) ? group : garage.deck;
  const others = garage.deck.some((v) => v.id === id) ? garage.others : group;
  return [...deck, ...others].map((v) => v.id);
}
