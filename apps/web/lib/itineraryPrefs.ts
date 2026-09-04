"use client";

import { useEffect, useState } from "react";

const SHOW_COMPLETED_KEY = "travel:showCompletedByTrip";

function load(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const stored = window.localStorage.getItem(SHOW_COMPLETED_KEY);
    return stored ? (JSON.parse(stored) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** Per-trip "show completed entries" preference for the itinerary list view.
 * Client-side only — it's a view setting, not trip data, so it never
 * round-trips to the API.
 *
 * Stored as explicit choices rather than an opt-out set, because the *default*
 * isn't constant: while a trip is under way, checked-off entries drop out of
 * the list so what's left is what's still to do; before and after the trip
 * they stay visible, since the list is then a plan or a record.
 *
 * Starts with no stored choice (matching SSR) and fills from localStorage
 * after mount — the same hydration-safe shape the lists preference uses. */
export function useShowCompleted(tripId: number, defaultShow: boolean) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setOverrides(load());
  }, []);

  const override = overrides[String(tripId)];
  const showCompleted = override ?? defaultShow;

  function toggleShowCompleted() {
    setOverrides((prev) => {
      const next = { ...prev, [String(tripId)]: !showCompleted };
      window.localStorage.setItem(SHOW_COMPLETED_KEY, JSON.stringify(next));
      return next;
    });
  }

  return { showCompleted, toggleShowCompleted };
}
