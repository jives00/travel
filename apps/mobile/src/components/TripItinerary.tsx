import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable, Image, Linking } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import type { Booking, BookingType, ItineraryItem, Leg, Place, PlaceTag } from "@travel/types";
import {
  BOOKING_TYPES,
  PLACE_TAGS,
  enumLabel,
  mapPinGroupForTag,
  mapPinGroupForBookingType,
  todayDateString,
  formatDayHeading,
  type TripDay,
  itineraryCategoryLabel,
  compareItineraryCategories,
  placeMapsUrl,
  bookingMapsUrl,
} from "@travel/core";
import { MAP_PIN_COLORS, type MapPinGroup } from "@travel/ui-tokens";
import { travelApi } from "../lib/api";
import { useTheme } from "../lib/theme";
import { useScheduleItem, useUnscheduleItem, useMoveItem } from "../lib/offlineMutations/itinerary";
import { useRemoveBooking, useUpdateBooking } from "../lib/offlineMutations/bookings";
import { useUpdatePlace, useRemovePlace } from "../lib/offlineMutations/places";
import { AutocompleteSearch } from "./AutocompleteSearch";
import { AddressSearch } from "./AddressSearch";
import { BookingForm } from "./BookingForm";
import { TripCalendar } from "./TripCalendar";
import { Card, Button, TextField, Sheet, SegmentedControl, Dropdown } from "./ui";

/** Exported for the calendar view, which renders the same entries through this
 * component's own row renderer. Type-only, so there's no runtime import cycle. */
export interface Entry {
  key: string;
  kind: "booking" | "place" | "activity";
  legId: number | null;
  scheduledDate: string | null;
  time: string | null;
  title: string;
  subtitle: string;
  isPrivate: boolean;
  completed: boolean;
  itemId?: number; // itinerary item id (place/activity)
  bookingId?: number;
  placeId?: number;
  // Which collapsible category section this entry sorts into — see
  // itineraryCategoryLabel in @travel/core (date presence wins over tag/type).
  categoryLabel: string;
  // Same map-pin color grouping used on the trip map, drives the category
  // section's colored dot. Unset for ideas.
  mapPinGroup?: MapPinGroup;
  booking?: Booking;
}

function bookingEntry(b: Booking): Entry {
  const t = BOOKING_TYPES.find((x) => x.key === b.type);
  const scheduledDate = b.startAt ? b.startAt.slice(0, 10) : null;
  return {
    key: `b-${b.id}`,
    kind: "booking",
    legId: b.legId,
    scheduledDate,
    time: b.startAt && b.startAt.slice(11, 16) !== "00:00" ? b.startAt.slice(11, 16) : null,
    title: b.title,
    subtitle: t?.label ?? b.type,
    isPrivate: false,
    completed: b.completed,
    bookingId: b.id,
    categoryLabel: itineraryCategoryLabel({ hasDate: scheduledDate != null, kind: "booking", bookingType: b.type }),
    mapPinGroup: mapPinGroupForBookingType(b.type) as MapPinGroup,
    booking: b,
  };
}

function itemEntry(i: ItineraryItem, placeById: Map<number, Place>): Entry {
  const isPlace = i.itemType === "place";
  const place = isPlace && i.placeId != null ? placeById.get(i.placeId) : undefined;
  return {
    key: `i-${i.id}`,
    kind: isPlace ? "place" : "activity",
    legId: i.legId,
    scheduledDate: i.scheduledDate,
    time: i.time,
    title: isPlace ? place?.name ?? "Place" : i.activityText ?? "Idea",
    subtitle: isPlace ? (place?.primaryTag ? enumLabel(PLACE_TAGS, place.primaryTag) : "Place") : "Idea",
    isPrivate: i.isPrivate,
    completed: i.completed,
    itemId: i.id,
    placeId: isPlace ? (i.placeId ?? undefined) : undefined,
    categoryLabel: itineraryCategoryLabel({
      hasDate: i.scheduledDate != null,
      kind: isPlace ? "place" : "activity",
      placeTag: place?.primaryTag,
    }),
    mapPinGroup: isPlace ? (mapPinGroupForTag(place?.primaryTag) as MapPinGroup) : undefined,
  };
}

/** Buckets already-sorted entries by their category label, in
 * ITINERARY_CATEGORIES' fixed display order — drives the collapsible
 * category sections within a leg. Mirrors web. */
function groupByCategory(entries: Entry[]): [string, Entry[]][] {
  const map = new Map<string, Entry[]>();
  for (const entry of entries) map.set(entry.categoryLabel, [...(map.get(entry.categoryLabel) ?? []), entry]);
  return [...map.entries()].sort((a, b) => compareItineraryCategories(a[0], b[0]));
}

function CategoryDot({ entries }: { entries: Entry[] }) {
  const { theme } = useTheme();
  const group = entries.find((e) => e.mapPinGroup)?.mapPinGroup ?? "other";
  const color = (MAP_PIN_COLORS[group] ?? MAP_PIN_COLORS.other)[theme];
  return <View className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

/** The Maps action in the place/booking editors, sitting beside Save rather
 * than reading as a link in the body. The https URL hands off to the Google
 * Maps app when it's installed (Android app links) and opens the site
 * otherwise — no separate comgooglemaps:// scheme needed. */
function MapsButton({ url }: { url: string }) {
  return (
    <Pressable
      onPress={() => Linking.openURL(url)}
      accessibilityLabel="Open in Google Maps"
      className="h-10 flex-row items-center gap-1.5 rounded border border-gridline bg-surface px-3 dark:border-gridline-dark dark:bg-surface-dark"
    >
      <Ionicons name="location-sharp" size={18} color="#ea4335" />
      <Text className="text-sm font-medium text-text-primary dark:text-text-primary-dark">Maps</Text>
    </Pressable>
  );
}

function combineDateTime(date: string, time: string): string | undefined {
  if (!date.trim()) return undefined;
  return `${date.trim()}T${time.trim() || "00:00"}:00`;
}

function sortEntries(a: Entry, b: Entry): number {
  if (a.completed !== b.completed) return a.completed ? 1 : -1;
  if (a.scheduledDate && b.scheduledDate && a.scheduledDate !== b.scheduledDate)
    return a.scheduledDate < b.scheduledDate ? -1 : 1;
  if (a.scheduledDate && !b.scheduledDate) return -1;
  if (!a.scheduledDate && b.scheduledDate) return 1;
  const byTime = (a.time ?? "").localeCompare(b.time ?? "");
  if (byTime !== 0) return byTime;
  // Alphabetical last, so entries that tie on every scheduling field — which is
  // all of them in the dateless categories (To See, Food & Drinks, …) — land in
  // a predictable order instead of whatever order they were fetched in.
  return a.title.localeCompare(b.title, undefined, { sensitivity: "base" });
}

function toDateOnlyString(d: string): string {
  return d.length > 10 ? d.slice(0, 10) : d;
}

// "2026-07-18" -> "July 18, 2026" — timeZone: "UTC" pins the formatter so a
// date-only string doesn't get reinterpreted through the device's local offset.
function formatDateLong(d: string): string {
  return new Date(`${toDateOnlyString(d)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
}

// "HH:mm" (24h, as stored) -> "7:00 PM" — same UTC-pin trick, same convention as web.
function formatTime12h(t: string): string {
  return new Date(`2000-01-01T${t}:00Z`).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

/** Which group an entry belongs to: an explicit leg wins; otherwise a real date
 * either matches a leg's own range (auto-placed there), falls before the
 * earliest leg (Pre-Trip), after the latest (Post-Trip), or — with no leg and
 * no date at all — Unscheduled. Mirrors web's grouping (trip-itinerary.tsx). */
function groupFor(entry: Entry, legs: Leg[], earliestStart: string | null, latestEnd: string | null): string {
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

/** Wanderlog-style detail view for a scheduled place — mirrors web's
 * PlaceDetailPanel (name/tag/description/notes editable, scheduling below). */
function PlaceDetailFields({
  tripId,
  entry,
  place,
  legs,
  onClose,
}: {
  tripId: number;
  entry: Entry;
  place: Place | undefined;
  legs: Leg[];
  onClose: () => void;
}) {
  const update = useUpdatePlace();
  const removePlace = useRemovePlace();
  const move = useMoveItem(tripId);

  const [name, setName] = useState(place?.name ?? "");
  const [description, setDescription] = useState(place?.description ?? "");
  const [note, setNote] = useState(place?.note ?? "");
  const [legId, setLegId] = useState<number | null>(entry.legId);
  const [scheduledDate, setScheduledDate] = useState(entry.scheduledDate ?? "");
  const [isPrivate, setIsPrivate] = useState(entry.isPrivate);
  const [refreshing, setRefreshing] = useState(false);
  const [pickingCategory, setPickingCategory] = useState(false);
  const [pickingCity, setPickingCity] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(true);

  if (!place) {
    return (
      <Sheet visible onClose={onClose}>
        <Text className="text-sm text-text-muted">Place details unavailable.</Text>
      </Sheet>
    );
  }

  function saveName() {
    if (!place) return;
    if (!name.trim() || name.trim() === place.name) {
      setName(place.name);
      return;
    }
    update.mutate({ id: place.id, body: { name: name.trim() } });
  }

  function saveDescription() {
    if (!place || description === (place.description ?? "")) return;
    update.mutate({ id: place.id, body: { description: description.trim() } });
  }

  function saveNote() {
    if (!place || note === (place.note ?? "")) return;
    update.mutate({ id: place.id, body: { note: note.trim() } });
  }

  function setPrimaryTag(tag: PlaceTag) {
    if (!place) return;
    update.mutate({ id: place.id, body: { primaryTag: tag } });
    setPickingCategory(false);
  }

  async function refresh() {
    if (!place) return;
    setRefreshing(true);
    try {
      const updated = await travelApi.places.refreshDetails(place.id);
      setDescription(updated.description ?? "");
    } finally {
      setRefreshing(false);
    }
  }

  function saveSchedule() {
    if (!entry.itemId) return;
    move.mutate({
      itemId: entry.itemId,
      body: {
        legId,
        scheduledDate: scheduledDate.trim() || null,
        isPrivate,
      },
    });
    onClose();
  }

  function remove() {
    if (!place) return;
    removePlace.mutate({ id: place.id });
    onClose();
  }

  const categoryLabel = place.primaryTag ? (PLACE_TAGS.find((t) => t.key === place.primaryTag)?.label ?? place.primaryTag) : "Choose a category…";
  const cityLabel = legId != null ? (legs.find((l) => l.id === legId)?.city ?? "No city") : "No city";

  return (
    <Sheet
      visible
      onClose={onClose}
      footer={
        <View className="flex-row items-center justify-between gap-2">
          <View className="flex-row items-center gap-2">
            <Button title="Save" onPress={saveSchedule} />
            <MapsButton url={placeMapsUrl(place)} />
          </View>
          <View className="flex-row items-center gap-2">
            <Pressable
              onPress={() => setIsPrivate((p) => !p)}
              accessibilityLabel={isPrivate ? "Make public" : "Make private"}
              className="h-10 w-10 items-center justify-center rounded border border-gridline bg-surface dark:border-gridline-dark dark:bg-surface-dark"
            >
              <Ionicons name={isPrivate ? "lock-closed" : "lock-open-outline"} size={18} color="#898781" />
            </Pressable>
            <Button variant="danger" title="Delete" onPress={remove} />
          </View>
        </View>
      }
    >
      {place.heroPhotoUrl ? (
        <Image source={{ uri: place.heroPhotoUrl }} className="-mx-4 mb-3 h-48" resizeMode="cover" />
      ) : null}

      <TextField className="mb-2" label="Name" value={name} onChangeText={setName} onBlur={saveName} />

      {(place.rating != null || place.address) && (
        <View className="mb-2">
          {place.rating != null && (
            <Text className="text-sm text-text-primary dark:text-text-primary-dark">
              ★ {place.rating.toFixed(1)}
              {place.userRatingsTotal != null ? ` (${place.userRatingsTotal.toLocaleString()})` : ""}
            </Text>
          )}
          {place.address && <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">{place.address}</Text>}
        </View>
      )}

      <TextField
        className="mb-2"
        label="Description"
        value={description}
        onChangeText={setDescription}
        onBlur={saveDescription}
        placeholder="No description available — add your own…"
        multiline
        scrollEnabled={false}
      />

      <View className="mb-2 flex-row flex-wrap items-center gap-3">
        {place.website ? (
          <Text className="text-sm text-category-transit" onPress={() => Linking.openURL(place.website!)}>
            Visit website ↗
          </Text>
        ) : null}
        {place.googlePlaceId ? (
          <Text className="text-sm text-text-muted" onPress={refreshing ? undefined : refresh}>
            {refreshing ? "Refreshing…" : "Refresh from Google ⟳"}
          </Text>
        ) : null}
      </View>

      {place.hours && (
        <View className="mb-2">
          <Pressable onPress={() => setHoursOpen((o) => !o)}>
            <Text className="text-base text-text-secondary dark:text-text-secondary-dark">{hoursOpen ? "▾ " : "▸ "}Hours</Text>
          </Pressable>
          {hoursOpen && (
            <View className="mt-1">
              {Object.values(place.hours).map((line, i) => (
                <Text key={i} className="text-sm text-text-muted">
                  {line}
                </Text>
              ))}
            </View>
          )}
        </View>
      )}

      <View className="mb-3 flex-row gap-2">
        <View className="flex-1">
          <Text className="mb-1 text-xs font-medium text-text-muted">Category</Text>
          <Pressable
            onPress={() => setPickingCategory(true)}
            className="flex-row items-center justify-between rounded border border-gridline bg-surface p-2.5 dark:border-gridline-dark dark:bg-surface-dark"
          >
            <Text className="text-text-primary dark:text-text-primary-dark" numberOfLines={1}>
              {categoryLabel}
            </Text>
            <Text className="text-text-muted">▾</Text>
          </Pressable>
        </View>
        <View className="flex-1">
          <Text className="mb-1 text-xs font-medium text-text-muted">City</Text>
          <Pressable
            onPress={() => setPickingCity(true)}
            className="flex-row items-center justify-between rounded border border-gridline bg-surface p-2.5 dark:border-gridline-dark dark:bg-surface-dark"
          >
            <Text className="text-text-primary dark:text-text-primary-dark" numberOfLines={1}>
              {cityLabel}
            </Text>
            <Text className="text-text-muted">▾</Text>
          </Pressable>
        </View>
      </View>

      <TextField
        className="mb-3"
        label="Your notes"
        value={note}
        onChangeText={setNote}
        onBlur={saveNote}
        placeholder="Add a note about this place…"
        multiline
        numberOfLines={3}
      />

      <View className="mb-4">
        <TextField label="Date" value={scheduledDate} onChangeText={setScheduledDate} placeholder="YYYY-MM-DD" />
      </View>

      <Sheet visible={pickingCategory} onClose={() => setPickingCategory(false)}>
        <Text className="mb-3 text-lg font-semibold text-text-primary dark:text-text-primary-dark">Category</Text>
        {PLACE_TAGS.map((t) => (
          <Pressable key={t.key} onPress={() => setPrimaryTag(t.key as PlaceTag)} className="border-b border-gridline py-2.5 dark:border-gridline-dark">
            <Text className={t.key === place.primaryTag ? "font-semibold text-category-transit" : "text-text-primary dark:text-text-primary-dark"}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </Sheet>

      <Sheet visible={pickingCity} onClose={() => setPickingCity(false)}>
        <Text className="mb-3 text-lg font-semibold text-text-primary dark:text-text-primary-dark">City</Text>
        {[{ id: null, city: "No city" }, ...legs.map((l) => ({ id: l.id as number | null, city: l.city }))].map((l) => (
          <Pressable
            key={l.id ?? "none"}
            onPress={() => {
              setLegId(l.id);
              setPickingCity(false);
            }}
            className="border-b border-gridline py-2.5 dark:border-gridline-dark"
          >
            <Text className={l.id === legId ? "font-semibold text-category-transit" : "text-text-primary dark:text-text-primary-dark"}>
              {l.city}
            </Text>
          </Pressable>
        ))}
      </Sheet>
    </Sheet>
  );
}

/** Full booking edit — mirrors web's BookingFields (type, title, confirmation,
 * dates/times, price, notes, leg) plus the linked-place field added alongside
 * web's booking/place detail parity (BookingDetailPanel). */
function BookingEditFields({
  tripId,
  booking,
  legs,
  placeOptions,
  placeById,
  onClose,
}: {
  tripId: number;
  booking: Booking | undefined;
  legs: Leg[];
  placeOptions: { id: number; name: string }[];
  // Needed for coordinates, which placeOptions (id/name only) doesn't carry —
  // a booking with no address of its own falls back to its linked place.
  placeById: Map<number, Place>;
  onClose: () => void;
}) {
  const updateBooking = useUpdateBooking(tripId);
  const removeBooking = useRemoveBooking(tripId);

  const [type, setType] = useState<BookingType>(booking?.type ?? "flight");
  const [title, setTitle] = useState(booking?.title ?? "");
  const [confirmationCode, setConfirmation] = useState(booking?.confirmationCode ?? "");
  const [flightNumber, setFlightNumber] = useState(booking?.flightNumber ?? "");
  const [startDate, setStartDate] = useState(booking?.startAt?.slice(0, 10) ?? "");
  const startTimeRaw = booking?.startAt?.slice(11, 16) ?? "";
  const [startTime, setStartTime] = useState(startTimeRaw === "00:00" ? "" : startTimeRaw);
  const [endDate, setEndDate] = useState(booking?.endAt?.slice(0, 10) ?? "");
  const endTimeRaw = booking?.endAt?.slice(11, 16) ?? "";
  const [endTime, setEndTime] = useState(endTimeRaw === "00:00" ? "" : endTimeRaw);
  const [price, setPrice] = useState(booking?.price != null ? String(booking.price) : "");
  const [currency, setCurrency] = useState(booking?.currency ?? "");
  const [legId, setLegId] = useState<number | null>(booking?.legId ?? null);
  const [notes, setNotes] = useState(booking?.notes ?? "");
  const [address, setAddress] = useState(booking?.address ?? "");
  const [lat, setLat] = useState<number | null>(booking?.lat ?? null);
  const [lng, setLng] = useState<number | null>(booking?.lng ?? null);
  const [placeId, setPlaceId] = useState<number | null>(booking?.placeId ?? null);

  // A hotel never links to a place, so its own address is the only source.
  const linkedPlace = type !== "hotel" && placeId != null ? placeById.get(placeId) : undefined;
  const mapsUrl = bookingMapsUrl({ title, address, lat, lng }, linkedPlace);

  if (!booking) {
    return (
      <Sheet visible onClose={onClose}>
        <Text className="text-sm text-text-muted">Booking details unavailable.</Text>
      </Sheet>
    );
  }

  function save() {
    if (!booking || !title.trim()) return;
    // Cleared fields send `null`, not `undefined` — the PATCH route only writes
    // keys that are present, so omitting one leaves the old value in place and
    // clearing it (e.g. picking "None" for the linked place) would never stick.
    // See the comment on UpdateBookingBody in @travel/types.
    updateBooking.update(booking.id, {
      type,
      title: title.trim(),
      confirmationCode: confirmationCode.trim() || null,
      flightNumber: type === "flight" ? flightNumber.trim() || null : null,
      startAt: combineDateTime(startDate, startTime) ?? null,
      endAt: combineDateTime(endDate, endTime) ?? null,
      price: price.trim() ? Number(price) : null,
      currency: currency.trim().length === 3 ? currency.trim().toUpperCase() : null,
      legId: legId ?? null,
      notes: notes.trim() || null,
      address: address || null,
      lat: lat ?? null,
      lng: lng ?? null,
      placeId: type === "hotel" ? null : placeId,
    });
    onClose();
  }

  function remove() {
    if (!booking) return;
    removeBooking.mutate({ bookingId: booking.id });
    onClose();
  }

  return (
    <Sheet
      visible
      onClose={onClose}
      footer={
        <View className="flex-row items-center justify-between">
          <View className="flex-row items-center gap-2">
            <Button title="Save" onPress={save} loading={updateBooking.isPending} disabled={!title.trim()} />
            {/* Built from the live form state rather than the saved booking, so it
                follows an address you just picked. Absent when there's nothing to
                point at — no coordinates and no linked place. */}
            {mapsUrl && <MapsButton url={mapsUrl} />}
          </View>
          <Button variant="danger" title="Delete" onPress={remove} />
        </View>
      }
    >
      <Dropdown
        className="mb-3"
        label="Type"
        value={type}
        options={BOOKING_TYPES.map((t) => ({ value: t.key as BookingType, label: t.label }))}
        onChange={setType}
      />

      <TextField className="mb-3" label="Title" value={title} onChangeText={setTitle} />
      <View className="mb-3 flex-row gap-2">
        <TextField className="flex-1" label="Confirmation code" value={confirmationCode} onChangeText={setConfirmation} autoCapitalize="characters" />
        {type === "flight" && (
          <TextField className="flex-1" label="Flight number" value={flightNumber} onChangeText={setFlightNumber} autoCapitalize="characters" />
        )}
      </View>

      <View className="mb-3 flex-row gap-2">
        <TextField className="flex-1" label="Start date" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" />
        <TextField className="flex-1" label="Start time" value={startTime} onChangeText={setStartTime} placeholder="HH:mm" />
      </View>
      <View className="mb-3 flex-row gap-2">
        <TextField className="flex-1" label="End date" value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" />
        <TextField className="flex-1" label="End time" value={endTime} onChangeText={setEndTime} placeholder="HH:mm" />
      </View>

      <View className="mb-3 flex-row gap-2">
        <TextField className="flex-1" label="Price" value={price} onChangeText={setPrice} keyboardType="decimal-pad" />
        <TextField className="flex-1" label="Currency" value={currency} onChangeText={setCurrency} autoCapitalize="characters" maxLength={3} placeholder="USD" />
      </View>

      {legs.length > 0 && (
        <Dropdown
          className="mb-3"
          label="City (optional)"
          value={legId}
          options={[{ value: null, label: "None" }, ...legs.map((l) => ({ value: l.id as number | null, label: l.city }))]}
          onChange={setLegId}
        />
      )}

      {/* Not offered for hotels — their own address already fills the "where
          is this" role a linked place would. Mirrors web's BookingDetailPanel. */}
      {type !== "hotel" && placeOptions.length > 0 && (
        <Dropdown
          className="mb-3"
          label="Linked place (optional)"
          value={placeId}
          options={[{ value: null, label: "None" }, ...placeOptions.map((p) => ({ value: p.id as number | null, label: p.name }))]}
          onChange={setPlaceId}
        />
      )}

      <TextField className="mb-3" label="Notes" value={notes} onChangeText={setNotes} multiline numberOfLines={3} />

      <View className="mb-4">
        <AddressSearch
          address={address}
          onPicked={(r) => {
            setAddress(r.address);
            setLat(r.lat);
            setLng(r.lng);
          }}
          onCleared={() => {
            // lat/lng go with it — an address with no coordinates would just be
            // an unplottable string.
            setAddress("");
            setLat(null);
            setLng(null);
          }}
        />
      </View>
    </Sheet>
  );
}

/** The itinerary section — merges bookings + scheduled places/ideas into one
 * flat list grouped by city (leg), matching web's free-form model. Add ideas,
 * places (via search/manual), and bookings; edit date/time/private; remove. */
export function TripItinerary({ tripId, legs }: { tripId: number; legs: Leg[] }) {
  const { data: items } = useQuery(travelApi.queries.itineraryQuery(tripId));
  const { data: places } = useQuery(travelApi.queries.placesQuery({ tripId }));
  const { data: bookings } = useQuery(travelApi.queries.bookingsQuery(tripId));
  const { data: settings } = useQuery(travelApi.queries.settingsQuery());

  const scheduleItem = useScheduleItem(tripId);
  const unschedule = useUnscheduleItem(tripId);
  const move = useMoveItem(tripId);
  const updateBooking = useUpdateBooking(tripId);

  const [addingLegId, setAddingLegId] = useState<number | null | undefined>(undefined);
  const [addMode, setAddMode] = useState<"place" | "booking" | "activity" | "existing">("place");
  const [addIdeaText, setAddIdeaText] = useState("");
  const [addDate, setAddDate] = useState("");

  // List vs. calendar, remembered per trip like the collapse state below —
  // read in an effect rather than a useState initializer because AsyncStorage
  // is async and the first render has to commit before it resolves.
  const viewStorageKey = `travel:itinerary:view:${tripId}`;
  const [view, setView] = useState<"list" | "calendar">("list");
  useEffect(() => {
    let cancelled = false;
    void AsyncStorage.getItem(viewStorageKey).then((raw) => {
      if (!cancelled && raw === "calendar") setView("calendar");
    });
    return () => {
      cancelled = true;
    };
  }, [viewStorageKey]);

  function selectView(next: "list" | "calendar") {
    setView(next);
    void AsyncStorage.setItem(viewStorageKey, next);
  }
  const [editing, setEditing] = useState<Entry | null>(null);
  const [dateDraft, setDateDraft] = useState("");
  const [activityDraft, setActivityDraft] = useState("");
  const [collapsedLegs, setCollapsedLegs] = useState<Set<string>>(
    () => new Set([...legs.map((leg) => `leg-${leg.id}`), "pre", "post", "unscheduled"]),
  );
  // Remembered per-trip, same as web's itinerary section (and mobile's own
  // Lists sheet) — a collapse choice made once shouldn't reset the next time
  // this trip is opened. `loaded` gates the save effect so the persisted value
  // isn't clobbered by the all-collapsed default before it's had a chance to load.
  const collapsedLegsStorageKey = `travel:itinerary:collapsedSections:${tripId}`;
  const [collapsedLegsLoaded, setCollapsedLegsLoaded] = useState(false);
  useEffect(() => {
    let cancelled = false;
    setCollapsedLegsLoaded(false);
    void AsyncStorage.getItem(collapsedLegsStorageKey).then((raw) => {
      if (cancelled) return;
      if (raw) setCollapsedLegs(new Set(JSON.parse(raw) as string[]));
      setCollapsedLegsLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [collapsedLegsStorageKey]);
  useEffect(() => {
    if (!collapsedLegsLoaded) return;
    void AsyncStorage.setItem(collapsedLegsStorageKey, JSON.stringify([...collapsedLegs]));
  }, [collapsedLegs, collapsedLegsLoaded, collapsedLegsStorageKey]);

  function toggleCollapsed(key: string) {
    setCollapsedLegs((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const placeById = useMemo(() => new Map((places ?? []).map((p) => [p.id, p])), [places]);
  const placeOptions = useMemo(() => (places ?? []).map((p) => ({ id: p.id, name: p.name })), [places]);

  const entries = useMemo(() => {
    const showPrivate = settings?.showPrivateItems ?? true;
    return [
      ...(bookings ?? []).map(bookingEntry),
      ...(items ?? []).map((i) => itemEntry(i, placeById)),
    ].filter((e) => showPrivate || !e.isPrivate);
  }, [bookings, items, placeById, settings]);

  // Sorted by date, same as web — dateless legs sink after any dated legs.
  const sortedLegs = useMemo(
    () =>
      [...legs].sort((a, b) => {
        const ad = a.startDate ? toDateOnlyString(a.startDate) : null;
        const bd = b.startDate ? toDateOnlyString(b.startDate) : null;
        if (ad && bd) return ad.localeCompare(bd);
        if (ad) return -1;
        if (bd) return 1;
        return a.sortOrder - b.sortOrder;
      }),
    [legs],
  );

  const datedLegs = sortedLegs.filter((l) => l.startDate && l.endDate);
  const earliestStart = datedLegs.length
    ? datedLegs.reduce((min, l) => (toDateOnlyString(l.startDate!) < min ? toDateOnlyString(l.startDate!) : min), toDateOnlyString(datedLegs[0].startDate!))
    : null;
  const latestEnd = datedLegs.length
    ? datedLegs.reduce((max, l) => (toDateOnlyString(l.endDate!) > max ? toDateOnlyString(l.endDate!) : max), toDateOnlyString(datedLegs[0].endDate!))
    : null;

  const entriesByGroup = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries) {
      const key = groupFor(e, sortedLegs, earliestStart, latestEnd);
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    for (const list of map.values()) list.sort(sortEntries);
    return map;
  }, [entries, sortedLegs, earliestStart, latestEnd]);

  const groups: { key: string; label: string; entries: Entry[] }[] = [
    { key: "pre", label: "Pre-Trip", entries: entriesByGroup.get("pre") ?? [] },
    ...sortedLegs.map((leg) => ({ key: `leg-${leg.id}`, label: leg.city, entries: entriesByGroup.get(`leg-${leg.id}`) ?? [] })),
    { key: "post", label: "Post-Trip", entries: entriesByGroup.get("post") ?? [] },
    { key: "unscheduled", label: "Unscheduled", entries: entriesByGroup.get("unscheduled") ?? [] },
  ].filter((g) => g.entries.length > 0 || g.key.startsWith("leg-"));

  /** Everything with no date on it — what the calendar's day sheet offers to
   * drop onto the day you tapped. */
  const undatedEntries = useMemo(
    () => entries.filter((e) => !e.scheduledDate).sort(sortEntries),
    [entries],
  );

  function openAdd(legId: number | null) {
    setAddingLegId(legId);
    setAddMode("place");
    setAddIdeaText("");
    setAddDate("");
  }

  /** The calendar's per-day +. Opens on Existing when there's anything waiting
   * to be scheduled — from a specific day the usual intent is "put one of those
   * here", not "create something new" — and falls back to Place when there
   * isn't, so you never land on an empty list. Mirrors web. */
  function openAddForDay(day: TripDay) {
    setAddingLegId(day.legId);
    setAddMode(undatedEntries.length > 0 ? "existing" : "place");
    setAddIdeaText("");
    setAddDate(day.date);
  }

  /** One tap assigns an already-saved entry to the day the sheet was opened
   * from. A booking carries its date on startAt (midnight = no time set); a
   * place/idea carries scheduledDate. The day's leg goes along with it so the
   * entry also lands in the right city in the list view. */
  function scheduleExisting(entry: Entry) {
    if (!addDate) return;
    const legId = addingLegId ?? undefined;
    if (entry.kind === "booking" && entry.bookingId != null) {
      updateBooking.update(entry.bookingId, {
        startAt: `${addDate}T00:00:00`,
        ...(legId != null ? { legId } : {}),
      });
    } else if (entry.itemId != null) {
      move.mutate({
        itemId: entry.itemId,
        body: { scheduledDate: addDate, ...(legId != null ? { legId } : {}) },
      });
    }
    closeAdd();
  }

  function closeAdd() {
    setAddingLegId(undefined);
  }

  function saveIdea() {
    if (!addIdeaText.trim()) return;
    scheduleItem.schedule({
      itemType: "activity",
      activityText: addIdeaText.trim(),
      legId: addingLegId ?? undefined,
      scheduledDate: addDate.trim() || undefined,
    });
    closeAdd();
  }

  function openEdit(e: Entry) {
    setEditing(e);
    setDateDraft(e.scheduledDate ?? "");
    setActivityDraft(e.title);
  }

  function saveEdit() {
    if (!editing?.itemId) return setEditing(null);
    move.mutate({
      itemId: editing.itemId,
      body: {
        scheduledDate: dateDraft.trim() || null,
        activityText: activityDraft.trim() || undefined,
      },
    });
    setEditing(null);
  }

  function removeEntry(e: Entry) {
    if (e.itemId != null) unschedule.mutate({ itemId: e.itemId });
    setEditing(null);
  }

  function togglePrivate(e: Entry) {
    if (e.itemId != null) move.mutate({ itemId: e.itemId, body: { isPrivate: !e.isPrivate } });
    setEditing(null);
  }

  // Marking complete backfills scheduledDate with today's local date only if
  // it wasn't already set — no time is tracked, per spec.
  function toggleComplete(e: Entry) {
    const completed = !e.completed;
    if (e.kind === "booking" && e.bookingId != null) {
      updateBooking.update(e.bookingId, { completed });
      return;
    }
    if (e.itemId == null) return;
    move.mutate({
      itemId: e.itemId,
      body: {
        completed,
        ...(completed && !e.scheduledDate ? { scheduledDate: todayDateString() } : {}),
      },
    });
  }

  /** The Google Maps link for a card, so it's reachable without opening the
   * entry first. Ideas have no location; bookings fall back to their linked
   * place, same as the booking edit form. */
  function entryMapsUrl(e: Entry): string | null {
    if (e.kind === "place") {
      const place = e.placeId != null ? placeById.get(e.placeId) : undefined;
      return place ? placeMapsUrl(place) : null;
    }
    if (e.kind === "booking" && e.booking) {
      const linkedPlace = e.booking.type !== "hotel" && e.booking.placeId != null ? placeById.get(e.booking.placeId) : undefined;
      return bookingMapsUrl(e.booking, linkedPlace);
    }
    return null;
  }

  function renderEntryRow(e: Entry) {
    const mapsUrl = entryMapsUrl(e);
    return (
      <Card key={e.key} className={`mb-2 flex-row items-center gap-2 ${e.completed ? "opacity-50" : ""}`}>
        <Pressable
          onPress={() => toggleComplete(e)}
          accessibilityLabel={e.completed ? "Mark not visited" : "Mark visited"}
          className="h-8 w-8 items-center justify-center"
        >
          <Ionicons name={e.completed ? "checkbox" : "square-outline"} size={22} color={e.completed ? "#4f8f6a" : "#898781"} />
        </Pressable>
        <Pressable className="flex-1" onPress={() => openEdit(e)}>
          <Text
            className="text-text-primary dark:text-text-primary-dark"
            style={e.completed ? { textDecorationLine: "line-through" } : undefined}
          >
            {e.isPrivate ? "🔒 " : ""}
            {e.title}
          </Text>
          <Text className="text-xs text-text-muted">
            {e.subtitle}
            {e.scheduledDate
              ? ` · ${formatDateLong(e.scheduledDate)}${e.kind === "booking" && e.time ? ` ${formatTime12h(e.time)}` : ""}`
              : ""}
          </Text>
        </Pressable>
        {mapsUrl && (
          <Pressable
            onPress={() => Linking.openURL(mapsUrl)}
            accessibilityLabel={`Open ${e.title} in Google Maps`}
            hitSlop={8}
            className="h-8 w-8 items-center justify-center"
          >
            {/* Google Maps' own pin red, so the icon reads as the Maps app. */}
            <Ionicons name="location-sharp" size={24} color="#ea4335" />
          </Pressable>
        )}
      </Card>
    );
  }

  return (
    <View>
      <SegmentedControl
        className="mb-3"
        segments={[
          { value: "list", label: "List" },
          { value: "calendar", label: "Calendar" },
        ]}
        value={view}
        onChange={selectView}
      />

      {view === "calendar" ? (
        <TripCalendar
          tripId={tripId}
          legs={sortedLegs}
          entries={[...entries].sort(sortEntries)}
          renderEntry={renderEntryRow}
          onAddToDay={openAddForDay}
        />
      ) : (
        <>
      {groups.map((g) => {
        const collapsed = collapsedLegs.has(g.key);
        const isLeg = g.key.startsWith("leg-");
        const legId = isLeg ? Number(g.key.slice(4)) : null;
        const totalCount = g.entries.length;
        const visitedCount = g.entries.filter((e) => e.completed).length;
        const categoryGroups = isLeg ? groupByCategory(g.entries) : null;
        return (
        <View key={g.key} className="mb-4">
          <View className="mb-2 flex-row items-center justify-between">
            <Pressable className="flex-1" onPress={() => toggleCollapsed(g.key)}>
              <Text className="text-lg font-bold text-text-primary dark:text-text-primary-dark">
                {collapsed ? "▸ " : "▾ "}
                {g.label}
              </Text>
            </Pressable>
            {totalCount > 0 && (
              <Text className="mr-2 text-sm font-medium text-text-secondary dark:text-text-secondary-dark">
                {visitedCount}/{totalCount} visited
              </Text>
            )}
            {!collapsed && isLeg && (
              <Pressable
                onPress={() => openAdd(legId)}
                accessibilityLabel={`Add to ${g.label}`}
                className="h-8 w-8 items-center justify-center rounded-full bg-category-transit"
              >
                <Ionicons name="add" size={20} color="#fff" />
              </Pressable>
            )}
          </View>
          {collapsed ? null : g.entries.length === 0 ? (
            <Text className="mb-2 text-xs text-text-muted">Nothing scheduled here yet.</Text>
          ) : categoryGroups ? (
            categoryGroups.map(([label, catEntries]) => {
              const catKey = `${g.key}::cat::${label}`;
              const catCollapsed = collapsedLegs.has(catKey);
              return (
                <View key={label} className="mb-2">
                  <Pressable className="mb-1 flex-row items-center gap-2" onPress={() => toggleCollapsed(catKey)}>
                    <Text className="text-text-muted">{catCollapsed ? "▸" : "▾"}</Text>
                    <CategoryDot entries={catEntries} />
                    {/* flex-1 + numberOfLines: letterSpacing (tracking-wide) makes
                        Android under-measure the text, so the count wrapped to a
                        second row with room to spare. */}
                    <Text
                      numberOfLines={1}
                      className="flex-1 text-sm font-semibold uppercase tracking-wide text-text-secondary dark:text-text-secondary-dark"
                    >
                      {label} ({catEntries.length})
                    </Text>
                  </Pressable>
                  {!catCollapsed && catEntries.map(renderEntryRow)}
                </View>
              );
            })
          ) : (
            g.entries.map(renderEntryRow)
          )}
        </View>
        );
      })}

      <Button title="+ Add to itinerary" variant="secondary" onPress={() => openAdd(null)} />
        </>
      )}

      {/* Add place/booking/idea — opened from a city's + icon (legId preset) or
          the generic button above (no city preset), matching web's AddItemModal. */}
      <Sheet
        visible={addingLegId !== undefined}
        onClose={closeAdd}
        // Only the idea form's action lives out here; Place searches (no button
        // of its own) and Booking keeps its Save inside BookingForm, which owns
        // the state it needs.
        footer={
          addingLegId !== undefined && addMode === "activity" ? (
            <Button title="Add" onPress={saveIdea} disabled={!addIdeaText.trim()} />
          ) : undefined
        }
      >
        {addingLegId !== undefined && (
          <>
            <Text className="mb-3 text-lg font-semibold text-text-primary dark:text-text-primary-dark">
              {addDate
                ? `Add to ${formatDayHeading(addDate)}`
                : addingLegId != null
                  ? `Add to ${legs.find((l) => l.id === addingLegId)?.city ?? "trip"}`
                  : "Add to itinerary"}
            </Text>
            <SegmentedControl
              className="mb-3"
              segments={[
                // Only offered from a specific day, and only when there's
                // actually something undated to move onto it.
                ...(addDate && undatedEntries.length > 0
                  ? [{ value: "existing" as const, label: "Existing" }]
                  : []),
                { value: "place", label: "Place" },
                { value: "booking", label: "Booking" },
                { value: "activity", label: "Idea" },
              ]}
              value={addMode}
              onChange={setAddMode}
            />
            {addMode === "existing" ? (
              <View>
                <Text className="mb-2 text-xs text-text-muted">
                  Tap one to schedule it for this day.
                </Text>
                {undatedEntries.map((e) => (
                  <Pressable key={e.key} onPress={() => scheduleExisting(e)}>
                    <Card className="mb-2">
                      <Text className="text-text-primary dark:text-text-primary-dark">
                        {e.isPrivate ? "🔒 " : ""}
                        {e.title}
                      </Text>
                      <Text className="text-xs text-text-muted">{e.subtitle}</Text>
                    </Card>
                  </Pressable>
                ))}
              </View>
            ) : addMode === "place" ? (
              <AutocompleteSearch
                tripId={tripId}
                onCreated={(place) => {
                  scheduleItem.schedule({
                    itemType: "place",
                    placeId: place.id,
                    legId: addingLegId ?? undefined,
                    // Preset when the sheet was opened from a calendar day, so a
                    // place searched up there lands on that day rather than
                    // dropping into the undated pile.
                    scheduledDate: addDate.trim() || undefined,
                  });
                  closeAdd();
                }}
                onCancel={closeAdd}
              />
            ) : addMode === "booking" ? (
              <BookingForm tripId={tripId} legs={legs} defaultLegId={addingLegId} onSaved={closeAdd} />
            ) : (
              <>
                <TextField
                  className="mb-3"
                  label="Idea"
                  placeholder="e.g. Try the ramen place near the hotel"
                  value={addIdeaText}
                  onChangeText={setAddIdeaText}
                />
                <View className="mb-3">
                  <TextField label="Date (optional)" value={addDate} onChangeText={setAddDate} placeholder="YYYY-MM-DD" />
                </View>
              </>
            )}
          </>
        )}
      </Sheet>

      {/* Edit entry — a place gets the full detail view, a booking gets the full
          booking form, an idea gets a lightweight text + schedule editor. Each
          owns its own Sheet so its action row can be the pinned footer, which
          needs that editor's own state. */}
      {editing && editing.kind === "place" ? (
        <PlaceDetailFields
          tripId={tripId}
          entry={editing}
          place={editing.placeId != null ? placeById.get(editing.placeId) : undefined}
          legs={legs}
          onClose={() => setEditing(null)}
        />
      ) : editing && editing.kind === "booking" ? (
        <BookingEditFields
          tripId={tripId}
          booking={bookings?.find((b) => b.id === editing.bookingId)}
          legs={legs}
          placeOptions={placeOptions}
          placeById={placeById}
          onClose={() => setEditing(null)}
        />
      ) : editing ? (
        <Sheet
          visible
          onClose={() => setEditing(null)}
          footer={
            <View className="flex-row items-center justify-between gap-2">
              <Button title="Save" onPress={saveEdit} />
              <Button
                variant="secondary"
                title={editing.isPrivate ? "Make public" : "Make private"}
                onPress={() => togglePrivate(editing)}
              />
              <Button variant="danger" title="Remove" onPress={() => removeEntry(editing)} />
            </View>
          }
        >
          <TextField className="mb-3" label="Idea" value={activityDraft} onChangeText={setActivityDraft} />
          <View className="mb-3">
            <TextField label="Date" value={dateDraft} onChangeText={setDateDraft} placeholder="YYYY-MM-DD" />
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}
