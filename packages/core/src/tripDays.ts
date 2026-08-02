import type { Leg } from "@travel/types";
import { dateOnly, daysBetween, toDateOnlyString } from "./tripDates";

/** One calendar day of a trip, as rendered by the schedule/calendar view. */
export interface TripDay {
  /** "YYYY-MM-DD" */
  date: string;
  /** Which city the trip is in that day (the first leg whose range covers it),
   * or null on a day that falls in a gap between legs. */
  legId: number | null;
  city: string | null;
  /** 1-based position in the trip — "Day 3 of 9". */
  dayNumber: number;
}

/** Adds `n` days to a "YYYY-MM-DD" string, staying in UTC so a local DST
 * boundary can never shift the result by a day. */
export function addDays(date: string, n: number): string {
  const d = dateOnly(date);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Every day from the earliest leg start through the latest leg end,
 * inclusive and continuous — days sitting in a gap between two legs are
 * included (with a null leg) rather than dropped, so the calendar never has a
 * hole in it. Returns [] for a dreaming trip, where no leg has real dates.
 *
 * Legs are matched in the order given; overlapping legs resolve to the first
 * match, which is why callers should pass legs already sorted by start date. */
export function buildTripDays(legs: Leg[]): TripDay[] {
  const dated = legs.filter((l) => l.startDate && l.endDate);
  if (dated.length === 0) return [];

  const ranges = dated.map((l) => ({
    id: l.id,
    city: l.city,
    start: toDateOnlyString(l.startDate!),
    end: toDateOnlyString(l.endDate!),
  }));
  const earliest = ranges.reduce((min, r) => (r.start < min ? r.start : min), ranges[0].start);
  const latest = ranges.reduce((max, r) => (r.end > max ? r.end : max), ranges[0].end);

  const total = daysBetween(dateOnly(earliest), dateOnly(latest)) + 1;
  const days: TripDay[] = [];
  for (let i = 0; i < total; i++) {
    const date = addDays(earliest, i);
    const match = ranges.find((r) => date >= r.start && date <= r.end);
    days.push({ date, legId: match?.id ?? null, city: match?.city ?? null, dayNumber: i + 1 });
  }
  return days;
}

/** "Mon, Mar 3" — the calendar's day heading. UTC-pinned like every other date
 * formatter here, so a date-only string never renders as the previous day for
 * users west of UTC. */
export function formatDayHeading(date: string): string {
  return dateOnly(date).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}
