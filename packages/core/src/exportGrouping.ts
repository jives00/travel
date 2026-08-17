/** Assigns a trip's map pins to a leg (city) for the Google My Maps export.
 *
 * Places have no leg column — `trip_places` links a place to a *trip*, and a
 * leg is only ever implied by scheduling the place onto the itinerary. Bookings
 * do carry `leg_id` directly, but it is nullable. So one rule covers both, and
 * it mirrors buildShareItineraryText's `legIdFor`: an explicit leg wins,
 * otherwise a dated entry falls into whichever leg's range covers it. Anything
 * still unresolved — the ideas tray, i.e. places saved to the trip but never
 * scheduled, and undated legless bookings — is deliberately NOT guessed at by
 * proximity; it goes to its own "Unscheduled" layer instead.
 */

export interface SchedulingRef {
  /** Row id within its own table. Places and bookings are grouped separately,
   * so ids from the two never share a map. */
  id: number;
  legId: number | null;
  scheduledDate: string | null;
}

export interface LegRange {
  id: number;
  startDate: string | null;
  endDate: string | null;
}

function toDateOnly(d: string): string {
  return d.length > 10 ? d.slice(0, 10) : d;
}

/** The leg a single scheduling entry belongs to, or null if it resolves to none. */
export function legIdForScheduling(entry: SchedulingRef, legs: LegRange[]): number | null {
  if (entry.legId != null) return legs.some((l) => l.id === entry.legId) ? entry.legId : null;
  if (!entry.scheduledDate) return null;
  const date = toDateOnly(entry.scheduledDate);
  const match = legs.find(
    (l) => l.startDate && l.endDate && date >= toDateOnly(l.startDate) && date <= toDateOnly(l.endDate),
  );
  return match?.id ?? null;
}

/**
 * id -> legId for every entry that resolves to one. An entry appearing more
 * than once (the same place scheduled on two different days/cities) takes the
 * first that resolves, in the order given — callers pass entries already sorted
 * by date/sort order, so that is the earliest occurrence.
 */
export function groupByLeg(entries: SchedulingRef[], legs: LegRange[]): Map<number, number> {
  const byId = new Map<number, number>();
  for (const entry of entries) {
    if (byId.has(entry.id)) continue;
    const legId = legIdForScheduling(entry, legs);
    if (legId != null) byId.set(entry.id, legId);
  }
  return byId;
}
