import type { PlaceTag } from "@travel/types";

/** Itinerary list grouping buckets, in display order (see groupByCategory
 * call sites in web/mobile trip-itinerary components). */
export const ITINERARY_CATEGORIES = [
  "Scheduled Activities",
  "To See",
  "Food & Drinks",
  "Nightlife",
  "Travel & Lodging",
  "Other",
] as const;
export type ItineraryCategory = (typeof ITINERARY_CATEGORIES)[number];

const PLACE_TAG_CATEGORY: Record<PlaceTag, ItineraryCategory> = {
  activity: "To See",
  day_trip: "To See",
  site: "To See",
  shopping: "To See",
  food_drinks: "Food & Drinks",
  nightlife: "Nightlife",
  lodging: "Travel & Lodging",
  transit: "Other",
  other: "Other",
};

const BOOKING_TYPE_CATEGORY: Record<string, ItineraryCategory> = {
  flight: "Travel & Lodging",
  hotel: "Travel & Lodging",
  train: "Travel & Lodging",
  car: "Travel & Lodging",
  restaurant: "Food & Drinks",
  event: "Other",
  activity: "To See",
};

/** Which collapsible category section an itinerary entry belongs to.
 * Scheduling wins over tag/type: any entry with a real date lands in
 * "Scheduled Activities" regardless of its underlying place tag or booking
 * type — undated entries fall back to a category bucket instead. */
export function itineraryCategoryLabel(opts: {
  hasDate: boolean;
  kind: "booking" | "place" | "activity";
  bookingType?: string;
  placeTag?: PlaceTag | null;
}): ItineraryCategory {
  if (opts.hasDate) return "Scheduled Activities";
  if (opts.kind === "booking") return (opts.bookingType && BOOKING_TYPE_CATEGORY[opts.bookingType]) || "Other";
  if (opts.kind === "place") return (opts.placeTag && PLACE_TAG_CATEGORY[opts.placeTag]) || "Other";
  return "Other";
}

/** Sorts category-grouped entries into ITINERARY_CATEGORIES' fixed display
 * order rather than alphabetically. */
export function compareItineraryCategories(a: string, b: string): number {
  const ai = ITINERARY_CATEGORIES.indexOf(a as ItineraryCategory);
  const bi = ITINERARY_CATEGORIES.indexOf(b as ItineraryCategory);
  return (ai === -1 ? ITINERARY_CATEGORIES.length : ai) - (bi === -1 ? ITINERARY_CATEGORIES.length : bi);
}

/** The date an itinerary entry sits on in the day-by-day calendar: **the day it
 * was actually checked off, falling back to the day it was planned for.**
 *
 * That order round, not the other way: the calendar is the "when did this
 * happen" view, and once something has happened, the plan is the weaker claim
 * about it. Segovia was booked for Saturday and done on Friday; filing it under
 * Saturday showed a day that hadn't started yet already ticked off, and hid the
 * day it really belongs to. A completed entry that was never scheduled at all
 * (a place visited on a whim) is placed by the same rule, which is why
 * `completedAt` exists — see migration 033.
 *
 * `completedAt` is cleared when an entry is un-checked, so an entry that still
 * has one is by definition still complete.
 *
 * None of this reaches the list view's *grouping*, which keeps using
 * scheduledDate (`itineraryCategoryLabel`, `groupFor`) so checking an entry off
 * never moves it between sections. */
export function itineraryDisplayDate(entry: {
  scheduledDate: string | null;
  completedAt?: string | null;
}): string | null {
  return entry.completedAt ?? entry.scheduledDate ?? null;
}
