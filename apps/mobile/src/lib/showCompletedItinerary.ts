import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SHOW_COMPLETED_KEY = "travel:showCompletedByTrip";

/** Per-trip "show completed entries" preference for the itinerary list view.
 * Client-side only — it's a view setting, not trip data, so it never
 * round-trips to the API.
 *
 * Stored as explicit choices rather than an opt-out set, because the *default*
 * isn't constant: while a trip is under way, checked-off entries drop out of
 * the list so what's left is what's still to do; before and after the trip
 * they stay visible, since the list is then a plan or a record. The caller
 * supplies that default and this store only remembers overrides.
 *
 * Module-level (like the lists preference) so every screen showing the same
 * trip's itinerary reads one copy instead of racing separate writes. */
let overrides: Record<string, boolean> = {};
const listeners = new Set<() => void>();

void AsyncStorage.getItem(SHOW_COMPLETED_KEY).then((stored) => {
  if (!stored) return;
  try {
    overrides = JSON.parse(stored) as Record<string, boolean>;
    listeners.forEach((l) => l());
  } catch {
    // Corrupt value — fall back to the caller's default.
  }
});

export function setShowCompleted(tripId: number, show: boolean): void {
  overrides = { ...overrides, [String(tripId)]: show };
  void AsyncStorage.setItem(SHOW_COMPLETED_KEY, JSON.stringify(overrides));
  listeners.forEach((l) => l());
}

/** The user's explicit choice for this trip, or undefined if they haven't made
 * one — the caller then falls back to its own default. */
export function useShowCompletedOverride(tripId: number): boolean | undefined {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => overrides[String(tripId)],
  );
}
