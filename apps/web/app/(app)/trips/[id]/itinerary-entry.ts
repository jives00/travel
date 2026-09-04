import type { Booking, ItineraryItem, Leg, Place } from "@travel/types";
import {
  BOOKING_TYPES,
  PLACE_TAGS,
  mapPinGroupForTag,
  mapPinGroupForBookingType,
  itineraryCategoryLabel,
  compareItineraryCategories,
  itineraryDisplayDate,
} from "@travel/core";
import type { MapPinGroup } from "@travel/ui-tokens";

// The shared entry model behind both itinerary views (the grouped list and the
// day-by-day calendar): bookings and itinerary items (places/ideas) normalized
// into one `Entry` shape, plus the date helpers and grouping/sorting rules they
// both apply. Kept free of JSX so either view can import it without cycles.

export function toDateOnlyString(d: string): string {
  return d.length > 10 ? d.slice(0, 10) : d;
}

export function dateOnly(d: string): Date {
  return new Date(`${toDateOnlyString(d)}T00:00:00Z`);
}

// "HH:mm" (24h, as stored/edited) -> "7:00 PM" for display — same literal
// wall-clock convention used everywhere else (timeZone: "UTC" pins the
// formatter so it doesn't reinterpret through the browser's local offset).
export function formatTime12h(hhmm: string): string {
  return new Date(`2000-01-01T${hhmm}:00Z`).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

export function formatDate(d: string): string {
  return dateOnly(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

export function formatDateRange(start: string, end: string): string {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

export type EntryKind = "booking" | "place" | "activity";

export interface Entry {
  key: string;
  kind: EntryKind;
  legId: number | null;
  scheduledDate: string | null;
  time: string | null;
  title: string;
  subtitle: string;
  // Material Symbols ligature name — set for place entries (from the place's
  // primary tag) so the list can show a category icon instead of the word
  // "place". Left unset for bookings/ideas, which keep the text subtitle.
  icon?: string;
  // Human-readable label for `icon`, shown as its hover tooltip.
  iconLabel?: string;
  // Place description, shown under the title — only set for place entries.
  description?: string;
  // Set only for place entries — lets the list tell the map which marker to
  // highlight on hover.
  placeId?: number;
  // Only place/idea entries can be marked private (backed by itinerary_items.
  // is_private) — bookings never carry this flag.
  isPrivate: boolean;
  // Place/idea entries are checked off via itinerary_items.completed; booking
  // entries are checked off via bookings.completed — same UI, different column.
  completed: boolean;
  // The day a place/idea was checked off. Never feeds grouping or the category
  // label — only the date shown on the row and the calendar's day placement, so
  // checking something off records when it happened without moving it in the
  // list. Bookings carry their own date on startAt, so this stays null there.
  completedAt: string | null;
  // Which collapsible category section this entry sorts into — see
  // itineraryCategoryLabel in @travel/core (date presence wins over tag/type).
  categoryLabel: string;
  // Set only for place entries — same map-pin color grouping used on the
  // trip map, so a place's icon circle matches its marker there.
  mapPinGroup?: MapPinGroup;
  booking?: Booking;
  item?: ItineraryItem;
}

export function bookingEntry(b: Booking): Entry {
  const scheduledDate = b.startAt ? toDateOnlyString(b.startAt) : null;
  const time = b.startAt && b.startAt.slice(11, 16) !== "00:00" ? b.startAt.slice(11, 16) : null;
  const bookingType = BOOKING_TYPES.find((t) => t.key === b.type);
  return {
    key: `booking-${b.id}`,
    kind: "booking",
    legId: b.legId,
    scheduledDate,
    time,
    title: b.title,
    subtitle: b.type,
    icon: bookingType?.iconName,
    iconLabel: bookingType?.label,
    description: b.notes ?? undefined,
    isPrivate: false,
    completed: b.completed,
    completedAt: null,
    categoryLabel: itineraryCategoryLabel({ hasDate: scheduledDate != null, kind: "booking", bookingType: b.type }),
    mapPinGroup: mapPinGroupForBookingType(b.type) as MapPinGroup,
    booking: b,
  };
}

export function itemEntry(i: ItineraryItem, placesById: Map<number, Place>): Entry {
  const isPlace = i.itemType === "place";
  const place = isPlace && i.placeId ? placesById.get(i.placeId) : undefined;
  const placeTag = isPlace && place?.primaryTag ? PLACE_TAGS.find((t) => t.key === place.primaryTag) : undefined;
  return {
    key: `item-${i.id}`,
    kind: isPlace ? "place" : "activity",
    legId: i.legId,
    scheduledDate: i.scheduledDate,
    time: i.time,
    title: isPlace ? (place?.name ?? "Place") : (i.activityText ?? "Idea"),
    subtitle: isPlace ? "place" : "idea",
    icon: isPlace ? placeTag?.iconName || "place" : "lightbulb",
    iconLabel: isPlace ? placeTag?.label : "Idea",
    description: isPlace ? (place?.description ?? undefined) : undefined,
    placeId: isPlace ? place?.id : undefined,
    isPrivate: i.isPrivate,
    completed: i.completed,
    completedAt: i.completedAt,
    categoryLabel: itineraryCategoryLabel({
      hasDate: i.scheduledDate != null,
      kind: isPlace ? "place" : "activity",
      placeTag: place?.primaryTag,
    }),
    mapPinGroup: isPlace ? (mapPinGroupForTag(place?.primaryTag) as MapPinGroup) : undefined,
    item: i,
  };
}

/** Which group an entry belongs to: an explicit leg wins; otherwise a real date
 * either matches a leg's own range (auto-placed there), falls before the
 * earliest leg (Pre-Trip), after the latest (Post-Trip), or — with no leg and
 * no date at all — Unscheduled. */
export function groupFor(entry: Entry, legs: Leg[], earliestStart: string | null, latestEnd: string | null): string {
  if (entry.legId != null) return `leg-${entry.legId}`;
  if (entry.scheduledDate) {
    const match = legs.find(
      (l) =>
        l.startDate &&
        l.endDate &&
        entry.scheduledDate! >= toDateOnlyString(l.startDate) &&
        entry.scheduledDate! <= toDateOnlyString(l.endDate),
    );
    if (match) return `leg-${match.id}`;
    if (earliestStart && entry.scheduledDate < earliestStart) return "pre";
    if (latestEnd && entry.scheduledDate > latestEnd) return "post";
  }
  return "unscheduled";
}

/** Row/calendar date for an entry — see itineraryDisplayDate in @travel/core. */
export function entryDisplayDate(entry: Entry): string | null {
  return itineraryDisplayDate(entry);
}

export function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const ad = entryDisplayDate(a) ?? "zzzz";
    const bd = entryDisplayDate(b) ?? "zzzz";
    if (ad !== bd) return ad.localeCompare(bd);
    const at = a.time ?? "zz:zz";
    const bt = b.time ?? "zz:zz";
    if (at !== bt) return at.localeCompare(bt);
    return a.title.localeCompare(b.title);
  });
}

/** Buckets already-sorted entries by their category label, in
 * ITINERARY_CATEGORIES' fixed display order — drives the collapsible
 * category sections within a leg. */
export function groupByCategory(entries: Entry[]): [string, Entry[]][] {
  const map = new Map<string, Entry[]>();
  for (const entry of entries) map.set(entry.categoryLabel, [...(map.get(entry.categoryLabel) ?? []), entry]);
  return [...map.entries()].sort((a, b) => compareItineraryCategories(a[0], b[0]));
}

export interface LegOption {
  id: number;
  city: string;
}
