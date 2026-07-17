import type { Leg, Trip } from "@travel/types";

function parseDate(d: string): Date {
  // date-only strings (YYYY-MM-DD) parsed as UTC midnight to avoid local-tz drift
  return new Date(`${d}T00:00:00Z`);
}

function toDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** The leg(s) whose date range contains `date`. Usually one; two on a travel day
 * (checkout leg + check-in leg share the boundary date). */
export function legsForDate(trip: Trip, date: string): Leg[] {
  const target = parseDate(date).getTime();
  return trip.legs.filter((leg) => {
    if (!leg.startDate || !leg.endDate) return false;
    const start = parseDate(leg.startDate).getTime();
    const end = parseDate(leg.endDate).getTime();
    return target >= start && target <= end;
  });
}

/** The single "primary" leg for a date — the one whose check-in (startDate) is
 * latest-but-not-after `date`. On a travel day, prefer the leg being checked INTO. */
export function legForDate(trip: Trip, date: string): Leg | null {
  const candidates = legsForDate(trip, date);
  if (candidates.length === 0) return null;
  return candidates.reduce((latest, leg) =>
    (leg.startDate ?? "") > (latest.startDate ?? "") ? leg : latest,
  );
}

/** True when `date` is a leg boundary — the checkout day of one leg and the
 * check-in day of the next. Today view then shows both the checkout and check-in card. */
export function isTravelDay(trip: Trip, date: string): boolean {
  return legsForDate(trip, date).length > 1;
}

export interface LegDay {
  dayIndex: number;
  date: string | null; // real calendar date once the leg is dated, else null
  label: string; // "Mar 4" once dated, else "Day 2"
}

/** Enumerates a leg's days. Dateless legs (dreaming trips) use `dayCount` and
 * relative labels ("Day 1", "Day 2", ...) instead of real dates. */
export function daysOfLeg(leg: Leg): LegDay[] {
  if (leg.startDate && leg.endDate) {
    const start = parseDate(leg.startDate);
    const end = parseDate(leg.endDate);
    const count = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    return Array.from({ length: count }, (_, i) => {
      const d = new Date(start.getTime() + i * 86_400_000);
      return {
        dayIndex: i,
        date: toDateOnly(d),
        label: d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" }),
      };
    });
  }
  const count = leg.dayCount ?? 1;
  return Array.from({ length: count }, (_, i) => ({
    dayIndex: i,
    date: null,
    label: `Day ${i + 1}`,
  }));
}

/** Once a dateless leg gets a real start date, relative day indices remap onto
 * real calendar dates automatically — this is that remap, applied to one dayIndex. */
export function remapRelativeDay(leg: Leg, dayIndex: number): string | null {
  if (!leg.startDate) return null;
  const start = parseDate(leg.startDate);
  return toDateOnly(new Date(start.getTime() + dayIndex * 86_400_000));
}
