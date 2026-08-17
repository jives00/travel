import type { Booking, Leg, Place } from "@travel/types";
import { BOOKING_TYPES, enumLabel } from "./enums";

/** How long a timed event runs when nothing says otherwise — a dinner
 * reservation records when it starts, never when it ends. */
const DEFAULT_EVENT_MINUTES = 60;

interface When {
  date: string; // YYYY-MM-DD
  time: string | null; // HH:mm, null when the value carries no meaningful time
}

/** Reads the wall-clock date/time out of a stored value, which is either a
 * DATE ("2026-08-17") or an ISO datetime.
 *
 * The first 16 characters are taken as the wall clock deliberately, matching
 * what the itinerary and booking forms already do: bookings are DATETIME
 * columns with no zone, and the API containers run on UTC, so mysql2's Date →
 * JSON round trip hands back the stored wall time unchanged. Also mirrors the
 * export route's `formatWhen` in treating midnight as "no time set" — that's
 * what the booking form writes when the time field is left blank. */
function parseWhen(value: string | null | undefined): When | null {
  if (!value) return null;
  const s = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(s)) return null;
  const time = s[10] === "T" && /^\d{2}:\d{2}/.test(s.slice(11, 16)) ? s.slice(11, 16) : null;
  return { date: s.slice(0, 10), time: time === "00:00" ? null : time };
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

/** Arithmetic on the wall clock, never on an instant: Date.UTC keeps the local
 * timezone of whoever is running this out of the result. */
function shift(when: When, minutes: number): When {
  const ms =
    Date.UTC(
      Number(when.date.slice(0, 4)),
      Number(when.date.slice(5, 7)) - 1,
      Number(when.date.slice(8, 10)),
      when.time ? Number(when.time.slice(0, 2)) : 0,
      when.time ? Number(when.time.slice(3, 5)) : 0,
    ) +
    minutes * 60_000;
  const d = new Date(ms);
  return {
    date: `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`,
    time: when.time ? `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : null,
  };
}

function compact(when: When): string {
  const date = when.date.replace(/-/g, "");
  return when.time ? `${date}T${when.time.replace(":", "")}00` : date;
}

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

/** Builds a Google Calendar "create event" prefill link. Opens Google's own
 * new-event form with the fields filled in — the user still presses save, and
 * nothing syncs afterwards. There is no OAuth and no server involvement, which
 * is the whole point: the app can't reach Google's API on the user's behalf
 * without a token, but the user's own browser can.
 *
 * Stored times are wall clock at the place the event happens, so a `timezone`
 * turns them into a real instant: a 10:00 Madrid tour sent with
 * `ctz=Europe/Madrid` shows as 04:00 from a US calendar today and 10:00 once
 * that calendar is on Madrid time — which is the point. Google also records the
 * zone on the event, so its detail view names it rather than silently shifting.
 *
 * Without a timezone the times stay floating and Google reads them in whatever
 * zone the viewing calendar uses, which is what happened before legs carried
 * zones and is still the fallback when one can't be resolved.
 *
 * All-day events never take a zone. A museum day is the whole of that date
 * wherever you are, and pinning it to a zone would let it bleed into the day
 * before or after.
 *
 * Returns null when there is no date to hang an event on. */
export function googleCalendarUrl(opts: {
  title: string;
  /** "YYYY-MM-DD" or an ISO datetime; midnight counts as no time. */
  start: string | null | undefined;
  end?: string | null;
  location?: string | null;
  details?: string | null;
  /** IANA zone id the start/end wall times belong to, e.g. "Europe/Madrid". */
  timezone?: string | null;
}): string | null {
  const start = parseWhen(opts.start);
  if (!start) return null;
  const end = parseWhen(opts.end);

  // Timed only when both ends carry a real time. A hotel that checks in at
  // 15:00 and has a bare checkout date would otherwise become a one-hour event
  // on arrival day; as an all-day span it reads like the stay it is.
  let range: [When, When];
  if (start.time && (!end || end.time)) {
    const finish = end?.time ? end : shift(start, DEFAULT_EVENT_MINUTES);
    range = [start, compact(finish) <= compact(start) ? shift(start, DEFAULT_EVENT_MINUTES) : finish];
  } else {
    const lastDay = end && end.date > start.date ? end : start;
    // Google's all-day end date is exclusive — a single day ends the next one.
    range = [{ date: start.date, time: null }, shift({ date: lastDay.date, time: null }, 24 * 60)];
  }

  // Hand-rolled like googleMapsUrl: this package compiles with no DOM/Node
  // types, so URLSearchParams isn't available here.
  const params = [
    "action=TEMPLATE",
    `text=${encodeURIComponent(opts.title)}`,
    `dates=${compact(range[0])}/${compact(range[1])}`,
  ];
  if (opts.location) params.push(`location=${encodeURIComponent(opts.location)}`);
  if (opts.details) params.push(`details=${encodeURIComponent(opts.details)}`);
  // `range[0].time` is set only on the timed branch, so all-day events skip the
  // zone by construction.
  if (opts.timezone && range[0].time) params.push(`ctz=${encodeURIComponent(opts.timezone)}`);
  return `https://calendar.google.com/calendar/render?${params.join("&")}`;
}

/** Null for a booking with no start — an unscheduled reservation has no event
 * to create. Location and details fall back to the linked place the same way
 * `bookingMapsUrl` does.
 *
 * Flights deliberately ignore the timezone. A booking inherits its leg's zone,
 * which is the *destination* — right for the hotel and the tour there, wrong
 * for a departure that happens before you leave home. Until a booking can carry
 * a zone at each end, a flight is left floating (read in the viewing calendar's
 * zone), which is correct for the outbound flight people actually enter. */
export function bookingCalendarUrl(
  booking: Pick<
    Booking,
    "title" | "type" | "startAt" | "endAt" | "address" | "confirmationCode" | "flightNumber" | "notes"
  >,
  opts: { linkedPlace?: Pick<Place, "name" | "address"> | null; timezone?: string | null } = {},
): string | null {
  const linkedPlace = opts.linkedPlace;
  const details = [
    enumLabel(BOOKING_TYPES, booking.type),
    booking.flightNumber ? `Flight ${booking.flightNumber}` : null,
    booking.confirmationCode ? `Confirmation: ${booking.confirmationCode}` : null,
    booking.notes,
  ]
    .filter((line): line is string => !!line)
    .join("\n");

  return googleCalendarUrl({
    title: booking.title,
    start: booking.startAt,
    end: booking.endAt,
    location: booking.address ?? linkedPlace?.address ?? linkedPlace?.name ?? null,
    details,
    timezone: booking.type === "flight" ? null : opts.timezone,
  });
}

/** For a scheduled place or free-text idea. Itinerary items have a date and an
 * optional "HH:mm" but never a duration, so a timed one gets the default hour
 * and an untimed one becomes an all-day event. Null until the item is actually
 * scheduled. */
export function itineraryCalendarUrl(
  item: { title: string; scheduledDate: string | null; time: string | null },
  opts: {
    place?: Pick<Place, "name" | "address" | "note" | "description"> | null;
    timezone?: string | null;
  } = {},
): string | null {
  const place = opts.place;
  return googleCalendarUrl({
    title: item.title,
    start: item.scheduledDate ? `${item.scheduledDate}${item.time ? `T${item.time}` : ""}` : null,
    location: place ? (place.address ?? place.name) : null,
    details: place?.note ?? place?.description ?? null,
    timezone: opts.timezone,
  });
}
