import type { Booking, Leg, Trip } from "@travel/types";

/** A MySQL DATE may arrive as "YYYY-MM-DD" or a full ISO datetime ("...T00:00:00.000Z")
 * — normalize to the date portion before reparsing, or a doubled time suffix
 * yields an Invalid Date. */
export function toDateOnlyString(d: string): string {
  return d.length > 10 ? d.slice(0, 10) : d;
}

export function dateOnly(d: string): Date {
  return new Date(`${toDateOnlyString(d)}T00:00:00Z`);
}

export function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

// "Leg" is the internal/data-model term; the UI calls it "city".
export function pluralCity(n: number): string {
  return n === 1 ? "city" : "cities";
}

export interface TripDateSpan {
  earliest: string;
  latest: string;
  totalDays: number;
}

/** The overall trip span — earliest date across dated cities *and* bookings
 * through the latest such date, inclusive. Returns null for a dreaming trip
 * (no leg has real dates yet). */
export function tripDateSpan(trip: Trip, bookings: Booking[]): TripDateSpan | null {
  const datedLegs = trip.legs.filter((l) => l.startDate && l.endDate);
  if (datedLegs.length === 0) return null;
  const legDates = datedLegs.flatMap((l) => [toDateOnlyString(l.startDate!), toDateOnlyString(l.endDate!)]);
  const bookingDates = bookings
    .flatMap((b) => [b.startAt, b.endAt])
    .filter((d): d is string => !!d)
    .map(toDateOnlyString);
  const allDates = [...legDates, ...bookingDates];
  const earliest = allDates.reduce((min, d) => (d < min ? d : min), allDates[0]);
  const latest = allDates.reduce((max, d) => (d > max ? d : max), allDates[0]);
  return { earliest, latest, totalDays: daysBetween(dateOnly(earliest), dateOnly(latest)) + 1 };
}

export interface Countdown {
  headline: string;
  subline: string;
}

/** Driven entirely by actual dates vs. today — not by trip.status — so a trip
 * whose cities start in the future always gets a "days to go" countdown, never a
 * broken "Day -53 of N". Pure: callers pass `today` (UTC-midnight) and pre-sorted
 * legs so web/mobile render identical strings. */
export function computeCountdown(trip: Trip, sortedLegs: Leg[], bookings: Booking[], today: Date): Countdown {
  const span = tripDateSpan(trip, bookings);

  if (!span) {
    const totalDays = sortedLegs.reduce((sum, l) => sum + (l.dayCount ?? 1), 0);
    return {
      headline: "Still dreaming",
      subline: `${totalDays} day(s) planned across ${sortedLegs.length} ${pluralCity(sortedLegs.length)} — no dates yet`,
    };
  }

  const { earliest, latest, totalDays: total } = span;
  const range = formatDateRange(earliest, latest);
  const start = dateOnly(earliest);
  const end = dateOnly(latest);

  if (today < start) {
    const n = daysBetween(today, start);
    const headline = n === 0 ? "Starts today!" : n === 1 ? "1 day to go" : `${n} days to go`;
    return { headline, subline: range };
  }
  if (today > end) {
    return { headline: "Trip completed", subline: range };
  }
  const day = daysBetween(start, today) + 1;
  return { headline: `Day ${day} of ${total}`, subline: range };
}

export function formatTripDate(d: string): string {
  return dateOnly(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function formatDateRange(start: string, end: string): string {
  return `${formatTripDate(start)} – ${formatTripDate(end)}`;
}

/** Earliest leg start / latest leg end (trip-card date label), leg-only (no bookings). */
export function earliestLegStart(trip: Pick<Trip, "legs">): string | null {
  const dated = trip.legs.filter((l) => l.startDate);
  if (dated.length === 0) return null;
  return dated.reduce((min, l) => (l.startDate! < min ? l.startDate! : min), dated[0].startDate!);
}

export function latestLegEnd(trip: Pick<Trip, "legs">): string | null {
  const dated = trip.legs.filter((l) => l.endDate);
  if (dated.length === 0) return null;
  return dated.reduce((max, l) => (l.endDate! > max ? l.endDate! : max), dated[0].endDate!);
}
