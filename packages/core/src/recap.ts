import type { Booking, DayNote, ItineraryItem, Leg, Place, Trip } from "@travel/types";
import { itineraryCategoryLabel, type ItineraryCategory } from "./itineraryCategory";
import { sortLegs } from "./legMath";
import { daysBetween, dateOnly, pluralCity, toDateOnlyString } from "./tripDates";

/**
 * The post-trip recap, as one shared definition.
 *
 * `sortLegs` and `computeReadiness` were each written twice and had drifted
 * before being consolidated; this starts life in core so there is never a
 * second version to reconcile. Web renders it first, mobile reads the same
 * function against the same cached queries.
 *
 * Everything here is derived live from rows that don't change after the fact —
 * nothing is snapshotted. A snapshot would be a second copy that goes wrong the
 * first time a typo is fixed.
 *
 * Two things it deliberately refuses to overstate:
 *
 * - **"Skipped" is not a thing this can know.** An unchecked item means either
 *   "didn't do it" or "stopped checking things off on day 3", and nothing in the
 *   data distinguishes them. Counts are phrased as *checked off*, and the
 *   remainder is reported as not checked off — never as skipped or missed.
 * - **Distance is great-circle, which is a lie for anything but a flight.** It
 *   is computed but labelled as such, and callers are free to leave it out.
 */

export interface RecapInput {
  trip: Trip;
  legs: Leg[];
  items: ItineraryItem[];
  places: Pick<Place, "id" | "name" | "primaryTag">[];
  bookings: Booking[];
  dayNotes: DayNote[];
  /** Per-leg spend, keyed as `rollupBudget` returns it. Optional: the recap
   * renders without money if the budget query hasn't resolved. */
  spendByLeg?: { legId: number | null; current: number }[];
  /** Trip-wide totals, again optional. */
  spend?: { current: number; estimated: number } | null;
  homeCurrency?: string | null;
}

export interface RecapActivityGroup {
  category: ItineraryCategory;
  /** Labels of the things checked off in this category, in itinerary order. */
  done: string[];
  /** How many in this category were never checked off. Reported, not judged. */
  notCheckedOff: number;
}

export interface RecapCity {
  legId: number;
  city: string;
  country: string | null;
  startDate: string | null;
  endDate: string | null;
  /** Nights, not days: a 9/7–9/14 leg is 7 nights. Null when undated. */
  nights: number | null;
  groups: RecapActivityGroup[];
  /** That city's day notes, in date order — the trip journal, which nothing
   * else in the app ever reads back. */
  notes: DayNote[];
  spend: number | null;
}

export interface Recap {
  totalDays: number | null;
  cityCount: number;
  countryCount: number;
  /** Countries actually named, for the header line. Deduped, in visit order. */
  countries: string[];
  placesVisited: number;
  placesNotCheckedOff: number;
  spend: number | null;
  budgeted: number | null;
  homeCurrency: string | null;
  cities: RecapCity[];
  /** Great-circle km between consecutive dated cities. Honest for flights only —
   * the caller must label it that way or omit it. Null with fewer than two
   * located cities. */
  crowFlightKm: number | null;
  /** Everything not checked off, across every city — what a "close out this
   * trip" action would act on, if one is ever added. */
  notCheckedOffTotal: number;
}

function nightsBetween(start: string | null, end: string | null): number | null {
  if (!start || !end) return null;
  return daysBetween(dateOnly(start), dateOnly(end));
}

/** Haversine, in km. */
function greatCircleKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function computeRecap(input: RecapInput): Recap {
  const legs = sortLegs(input.legs);
  const placeById = new Map(input.places.map((p) => [p.id, p]));
  const bookingById = new Map(input.bookings.map((b) => [b.id, b]));
  const spendByLeg = new Map((input.spendByLeg ?? []).map((s) => [s.legId, s.current]));

  function labelFor(item: ItineraryItem): string {
    if (item.activityText) return item.activityText;
    if (item.placeId != null) return placeById.get(item.placeId)?.name ?? "Untitled";
    if (item.bookingId != null) return bookingById.get(item.bookingId)?.title ?? "Untitled";
    return "Untitled";
  }

  function categoryFor(item: ItineraryItem): ItineraryCategory {
    const booking = item.bookingId != null ? bookingById.get(item.bookingId) : undefined;
    // The recap groups by *what a thing was*, not by whether it was scheduled —
    // so unlike the itinerary list, a date does not collapse everything into
    // "Scheduled Activities". Every entry is looked up on its own terms.
    return itineraryCategoryLabel({
      hasDate: false,
      kind: item.itemType,
      bookingType: booking?.type,
      placeTag: item.placeId != null ? (placeById.get(item.placeId)?.primaryTag ?? null) : null,
    });
  }

  let placesVisited = 0;
  let placesNotCheckedOff = 0;

  const cities: RecapCity[] = legs.map((leg) => {
    const legItems = input.items.filter((i) => i.legId === leg.id);
    const byCategory = new Map<ItineraryCategory, RecapActivityGroup>();

    for (const item of legItems) {
      const category = categoryFor(item);
      const group = byCategory.get(category) ?? { category, done: [], notCheckedOff: 0 };
      if (item.completed) {
        group.done.push(labelFor(item));
        placesVisited += 1;
      } else {
        group.notCheckedOff += 1;
        placesNotCheckedOff += 1;
      }
      byCategory.set(category, group);
    }

    const notes = input.dayNotes
      .filter((n) => {
        if (!leg.startDate || !leg.endDate) return false;
        const d = toDateOnlyString(n.date);
        return d >= toDateOnlyString(leg.startDate) && d <= toDateOnlyString(leg.endDate);
      })
      .sort((a, b) => toDateOnlyString(a.date).localeCompare(toDateOnlyString(b.date)));

    return {
      legId: leg.id,
      city: leg.city,
      country: leg.country ?? null,
      startDate: leg.startDate,
      endDate: leg.endDate,
      nights: nightsBetween(leg.startDate, leg.endDate),
      groups: [...byCategory.values()],
      notes,
      spend: spendByLeg.get(leg.id) ?? null,
    };
  });

  // Countries in visit order, deduped. A leg whose country hasn't been
  // backfilled yet simply doesn't contribute — better an undercount than a
  // phantom "1 country" for an unknown one.
  const countries: string[] = [];
  for (const leg of legs) {
    if (leg.country && !countries.includes(leg.country)) countries.push(leg.country);
  }

  const dated = legs.filter((l) => l.startDate && l.endDate);
  const totalDays =
    dated.length === 0
      ? null
      : daysBetween(
          dateOnly(dated.reduce((min, l) => (l.startDate! < min ? l.startDate! : min), dated[0].startDate!)),
          dateOnly(dated.reduce((max, l) => (l.endDate! > max ? l.endDate! : max), dated[0].endDate!)),
        ) + 1;

  const located = legs.filter(
    (l): l is Leg & { lat: number; lng: number } => l.lat != null && l.lng != null,
  );
  let crowFlightKm: number | null = null;
  if (located.length >= 2) {
    crowFlightKm = 0;
    for (let i = 1; i < located.length; i += 1) {
      crowFlightKm += greatCircleKm(located[i - 1], located[i]);
    }
    crowFlightKm = Math.round(crowFlightKm);
  }

  return {
    totalDays,
    cityCount: legs.length,
    countryCount: countries.length,
    countries,
    placesVisited,
    placesNotCheckedOff,
    spend: input.spend?.current ?? null,
    budgeted: input.spend?.estimated ?? null,
    homeCurrency: input.homeCurrency ?? null,
    cities,
    crowFlightKm,
    notCheckedOffTotal: placesNotCheckedOff,
  };
}

/** The header line, built once so both platforms read identically. */
export function recapHeadline(recap: Recap): string {
  const parts: string[] = [];
  if (recap.totalDays != null) parts.push(`${recap.totalDays} ${recap.totalDays === 1 ? "day" : "days"}`);
  parts.push(`${recap.cityCount} ${pluralCity(recap.cityCount)}`);
  if (recap.countryCount > 0)
    parts.push(`${recap.countryCount} ${recap.countryCount === 1 ? "country" : "countries"}`);
  return parts.join(" · ");
}
