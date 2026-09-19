import type { Leg } from "@travel/types";
import { dateToYmd } from "./wallClock";

/** Everything needed to work out which zone an event happens in. Legs carry
 * the zone of their city (resolved from the city name server-side); the home
 * zone covers what has no leg to inherit from. */
export interface TimezoneSource {
  legs?: readonly Pick<Leg, "id" | "timezone" | "startDate" | "endDate">[];
  homeTimezone?: string | null;
}

/** Picks the zone an event's wall-clock times should be read in.
 *
 * A leg association wins, because that's the explicit statement of where the
 * event is. Failing that, the date is matched against the legs' ranges — an
 * itinerary item's leg is optional, but a date that falls inside the Madrid
 * leg is a Madrid event whether or not it was ever filed under one. Then the
 * home zone, then null, which means "let the viewing calendar decide" — the
 * behavior before any of this existed, and a safe floor.
 *
 * Null is also what comes back while a leg is waiting on its lookup, so
 * callers must handle it rather than treating a zone as guaranteed. */
export function resolveTimezone(
  source: TimezoneSource,
  opts: { legId?: number | null; date?: string | null },
): string | null {
  const legs = source.legs ?? [];
  if (opts.legId != null) {
    const leg = legs.find((l) => l.id === opts.legId);
    if (leg?.timezone) return leg.timezone;
  }
  if (opts.date) {
    const covering = legs.find(
      (l) => l.timezone && l.startDate && l.endDate && l.startDate <= opts.date! && opts.date! <= l.endDate,
    );
    if (covering?.timezone) return covering.timezone;
  }
  return source.homeTimezone ?? null;
}

/** The calendar date it is *right now* in `timezone`, as "YYYY-MM-DD".
 *
 * Built from `formatToParts` rather than a locale that happens to print ISO
 * order, so the shape can't depend on which locale data the runtime shipped
 * with — a real concern on Hermes. A missing or unrecognized zone falls back to
 * the device's own date, which is what every caller here did before. */
export function todayInZone(timezone: string | null | undefined, now: Date = new Date()): string {
  if (!timezone) return dateToYmd(now);
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    const y = get("year");
    const m = get("month");
    const d = get("day");
    if (!y || !m || !d) return dateToYmd(now);
    return `${y}-${m}-${d}`;
  } catch {
    // Unknown zone id (or an Intl build without timezone data) — the device's
    // date is a worse answer, not no answer.
    return dateToYmd(now);
  }
}

/** What day it is *where the trip is*, as "YYYY-MM-DD".
 *
 * The itinerary's notion of "today" — which day row is highlighted, which days
 * are past, and the date stamped on an entry when it's checked off — has to
 * come from the trip's zone, not the device's. A laptop still on US time in
 * Seville reads 8am Saturday as Friday night, so the calendar marks the wrong
 * day "Today" and everything done that morning gets recorded against yesterday.
 * Off the trip it falls through to the home zone and then to the device, so
 * this is only ever a correction, never a shift.
 *
 * Two passes: the device's date picks the covering leg, but the zone that leg
 * resolves to can itself land on the next or previous date, which at a leg
 * boundary may be a *different* leg's day. One correction is enough — a second
 * flip would mean two legs disagreeing about the same date, where either answer
 * is equally defensible. */
export function todayInTripZone(source: TimezoneSource, now: Date = new Date()): string {
  let date = dateToYmd(now);
  for (let i = 0; i < 2; i++) {
    const tz = resolveTimezone(source, { date });
    if (!tz) return date;
    const next = todayInZone(tz, now);
    if (next === date) return date;
    date = next;
  }
  return date;
}
