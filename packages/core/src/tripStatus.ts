import type { Leg, Trip, TripStatus } from "@travel/types";

/** Computed, never stored. `dreaming` -> `planned` fires the instant any leg has
 * a real date range; `active`/`past` are always derived from today vs. dates.
 * Only needs each leg's dates — narrower than `Pick<Trip, "legs">` so callers
 * that only have partial leg rows (e.g. the /map overview) don't need to
 * fabricate full Leg objects just to compute a status. */
export function computeTripStatus(
  trip: { legs: Pick<Leg, "startDate" | "endDate">[] },
  today: Date = new Date(),
): TripStatus {
  const datedLegs = trip.legs.filter((l) => l.startDate && l.endDate);
  if (datedLegs.length === 0) return "dreaming";

  const todayStr = today.toISOString().slice(0, 10);
  const earliestStart = datedLegs.reduce((min, l) => (l.startDate! < min ? l.startDate! : min), datedLegs[0].startDate!);
  const latestEnd = datedLegs.reduce((max, l) => (l.endDate! > max ? l.endDate! : max), datedLegs[0].endDate!);

  if (todayStr < earliestStart) return "planned";
  if (todayStr > latestEnd) return "past";
  return "active";
}

/** The /map overview only distinguishes visited (been there) from everything
 * else (not there yet, whether dreaming/planned/active) — `past` is the only
 * status that means the trip actually happened. */
export function mapBucketForTripStatus(status: TripStatus): "visited" | "planned" {
  return status === "past" ? "visited" : "planned";
}

/** Which trip the Home page should show. A trip explicitly marked primary always
 * wins (the manual tiebreaker for when more than one trip's status — computed or
 * overridden — happens to be `active`); otherwise the first `active` trip; else
 * null, meaning Home has nothing to show. */
export function resolveHomeTrip<T extends Pick<Trip, "isPrimary" | "status">>(trips: T[]): T | null {
  return trips.find((t) => t.isPrimary) ?? trips.find((t) => t.status === "active") ?? null;
}
