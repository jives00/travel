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

/** The date an itinerary entry sits on in the day-by-day calendar: what the
 * user scheduled, falling back to the day it was checked off. Something
 * visited on a whim was never scheduled, so only completedAt can place it —
 * but that fallback stays out of the list view's grouping, which keeps using
 * scheduledDate so checking an entry off never moves it between sections. */
export function itineraryDisplayDate(entry: {
  scheduledDate: string | null;
  completedAt?: string | null;
}): string | null {
  return entry.scheduledDate ?? entry.completedAt ?? null;
}
