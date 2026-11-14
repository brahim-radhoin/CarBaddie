import { useMemo } from "react";
import {
  DEFAULT_PREFERENCES,
  formatDistance,
  formatMoney,
  fromDisplayDistance,
  toDisplayDistance,
} from "@carbaddie/core";
import { usePreferences } from "./useDatabase";

/**
 * Money and distance in the user's currency and unit. Values are stored as cents and km;
 * convert typed distances back with `fromDisplay` before saving.
 */
export function useUnits() {
  const { data: prefs = DEFAULT_PREFERENCES } = usePreferences();
  return useMemo(() => {
    const unit = prefs.distance_unit;
    return {
      currency: prefs.currency,
      unit,
      /** "$12.50" */
      money: (cents: number) => formatMoney(cents, prefs.currency),
      /** "12,345 km" / "7,671 mi" */
      distance: (km: number) => formatDistance(km, unit),
      /** km → number in the shown unit */
      toDisplay: (km: number) => toDisplayDistance(km, unit),
      /** number typed in the shown unit → km; pass the stored km an edit form started from */
      fromDisplay: (value: number, previousKm?: number | null) => fromDisplayDistance(value, unit, previousKm),
    };
  }, [prefs.currency, prefs.distance_unit]);
}
