import type { Booking, BookingType, ItineraryItem, Leg, Place } from "@travel/types";

/** Logistics bookings — the how-you-get-there/where-you-sleep half of a trip.
 * Nobody being handed a copy/pasted itinerary wants your flight numbers or
 * rental car, so these never appear in the shared text. */
const LOGISTICS_BOOKING_TYPES: BookingType[] = ["flight", "hotel", "train", "car"];

function toDateOnlyString(d: string): string {
  return d.length > 10 ? d.slice(0, 10) : d;
}

interface Shareable {
  legId: number | null;
  scheduledDate: string | null;
  title: string;
  placeId: number | null;
}

/** Mirrors the trip-itinerary views' `groupFor`, minus the Pre-Trip/Post-Trip
 * split: an explicit leg wins, otherwise a dated entry lands in whichever
 * leg's range covers it. Anything left over groups under "Other". */
function legIdFor(entry: Shareable, legs: Leg[]): number | null {
  if (entry.legId != null) return legs.some((l) => l.id === entry.legId) ? entry.legId : null;
  if (!entry.scheduledDate) return null;
  const match = legs.find(
    (l) =>
      l.startDate &&
      l.endDate &&
      entry.scheduledDate! >= toDateOnlyString(l.startDate) &&
      entry.scheduledDate! <= toDateOnlyString(l.endDate),
  );
  return match?.id ?? null;
}

export interface ShareItineraryInput {
  tripName: string;
  legs: Leg[];
  items: ItineraryItem[];
  places: Place[];
  bookings: Booking[];
}

/** Plain text, no dates: trip name, then each city with its places, ideas, and
 * non-logistics bookings. Built for pasting into a message, so it uses nothing
 * but newlines and "- " bullets.
 *
 * Private items are always dropped, whatever the owner's show_private_items
 * setting is — that toggle governs their own view, this governs what leaves
 * the app. */
export function buildShareItineraryText({
  tripName,
  legs,
  items,
  places,
  bookings,
}: ShareItineraryInput): string {
  const placesById = new Map(places.map((p) => [p.id, p]));

  const shareables: Shareable[] = [
    ...bookings
      .filter((b) => !LOGISTICS_BOOKING_TYPES.includes(b.type))
      .map((b) => ({ legId: b.legId, scheduledDate: b.startAt ? toDateOnlyString(b.startAt) : null, title: b.title, placeId: b.placeId })),
    // itemType "booking" rows are skipped because bookings never get their own
    // itinerary_item (see bookings.routes.ts) — the bookings list above is the
    // only source for those.
    ...items
      .filter((i) => i.itemType !== "booking" && !i.isPrivate)
      .map((i) => ({
        legId: i.legId,
        scheduledDate: i.scheduledDate,
        title: i.itemType === "place" ? (i.placeId != null ? (placesById.get(i.placeId)?.name ?? "") : "") : (i.activityText ?? ""),
        placeId: i.placeId,
      })),
  ];

  const byLeg = new Map<number | null, string[]>();
  // A booking attached to a place would otherwise list twice — once as the
  // booking, once as the itinerary place entry.
  const seenPlaceIds = new Set<number>();
  const seenTitlesByLeg = new Map<number | null, Set<string>>();

  for (const entry of shareables) {
    const title = entry.title.trim();
    if (!title) continue;
    if (entry.placeId != null) {
      if (seenPlaceIds.has(entry.placeId)) continue;
      seenPlaceIds.add(entry.placeId);
    }
    const legId = legIdFor(entry, legs);
    const seenTitles = seenTitlesByLeg.get(legId) ?? new Set<string>();
    if (seenTitles.has(title.toLowerCase())) continue;
    seenTitles.add(title.toLowerCase());
    seenTitlesByLeg.set(legId, seenTitles);
    byLeg.set(legId, [...(byLeg.get(legId) ?? []), title]);
  }

  const sections: string[] = [];
  for (const leg of legs) {
    const titles = byLeg.get(leg.id);
    if (!titles?.length) continue;
    sections.push([leg.city, ...titles.map((t) => `- ${t}`)].join("\n"));
  }
  const other = byLeg.get(null);
  if (other?.length) sections.push(["Other", ...other.map((t) => `- ${t}`)].join("\n"));

  if (!sections.length) return `${tripName}\n\nNothing to share yet.`;
  return [tripName, ...sections].join("\n\n");
}
