import { useMemo, useState } from "react";
import { View, Text, Pressable, Image, Linking } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import type { Booking, BookingType, ItineraryItem, Leg, Place, PlaceTag } from "@travel/types";
import { BOOKING_TYPES, PLACE_TAGS, enumLabel, mapPinGroupForTag, mapPinGroupForBookingType, todayDateString } from "@travel/core";
import { MAP_PIN_COLORS, type MapPinGroup } from "@travel/ui-tokens";
import { travelApi } from "../lib/api";
import { useTheme } from "../lib/theme";
import { useScheduleItem, useUnscheduleItem, useMoveItem } from "../lib/offlineMutations/itinerary";
import { useRemoveBooking, useUpdateBooking } from "../lib/offlineMutations/bookings";
import { useUpdatePlace, useRemovePlace } from "../lib/offlineMutations/places";
import { AutocompleteSearch } from "./AutocompleteSearch";
import { AddressSearch } from "./AddressSearch";
import { BookingForm } from "./BookingForm";
import { Card, Button, TextField, Sheet, SegmentedControl } from "./ui";

interface Entry {
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
  // Human-readable grouping label for the collapsible category sections
  // within a leg — a place's primary tag, a booking's type, or "Idea".
  categoryLabel: string;
  // Same map-pin color grouping used on the trip map, drives the category
  // section's colored dot. Unset for ideas.
  mapPinGroup?: MapPinGroup;
  booking?: Booking;
}

// Itinerary-only category grouping label — "activity" (Tour / Activity) and
// "day_trip" both read as trip-planning outings, so they're merged into one
// section here even though they stay distinct tags elsewhere (map pins, the
// place editor's tag picker, etc). Mirrors web's trip-itinerary.tsx.
function itineraryCategoryLabel(tag: PlaceTag | null | undefined, fallbackLabel: string): string {
  if (tag === "activity" || tag === "day_trip") return "Day Trips & Tours";
  return fallbackLabel;
}

function bookingEntry(b: Booking): Entry {
  const t = BOOKING_TYPES.find((x) => x.key === b.type);
  return {
    key: `b-${b.id}`,
    kind: "booking",
    legId: b.legId,
    scheduledDate: b.startAt ? b.startAt.slice(0, 10) : null,
    time: b.startAt && b.startAt.slice(11, 16) !== "00:00" ? b.startAt.slice(11, 16) : null,
    title: b.title,
    subtitle: t?.label ?? b.type,
    isPrivate: false,
    completed: b.completed,
    bookingId: b.id,
    categoryLabel: b.type === "activity" ? "Day Trips & Tours" : (t?.label ?? b.type),
    mapPinGroup: mapPinGroupForBookingType(b.type) as MapPinGroup,
    booking: b,
  };
}

function itemEntry(i: ItineraryItem, placeById: Map<number, Place>): Entry {
  const isPlace = i.itemType === "place";
  const place = isPlace && i.placeId != null ? placeById.get(i.placeId) : undefined;
  const placeTag = isPlace && place?.primaryTag ? PLACE_TAGS.find((t) => t.key === place.primaryTag) : undefined;
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
    categoryLabel: isPlace ? itineraryCategoryLabel(place?.primaryTag, placeTag?.label ?? "Uncategorized") : "Idea",
    mapPinGroup: isPlace ? (mapPinGroupForTag(place?.primaryTag) as MapPinGroup) : undefined,
  };
}

/** Buckets already-sorted entries by their category label, alphabetically —
 * drives the collapsible category sections within a leg. Mirrors web. */
function groupByCategory(entries: Entry[]): [string, Entry[]][] {
  const map = new Map<string, Entry[]>();
  for (const entry of entries) map.set(entry.categoryLabel, [...(map.get(entry.categoryLabel) ?? []), entry]);
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function CategoryDot({ entries }: { entries: Entry[] }) {
  const { theme } = useTheme();
  const group = entries.find((e) => e.mapPinGroup)?.mapPinGroup ?? "other";
  const color = (MAP_PIN_COLORS[group] ?? MAP_PIN_COLORS.other)[theme];
  return <View className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />;
}

// "2026-07-18" -> "Jul 18" — used by the transport divider's short date label.
function formatDateShort(d: string): string {
  return new Date(`${toDateOnlyString(d)}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function formatDurationBetween(startAt: string | null, endAt: string | null): string | null {
  if (!startAt || !endAt) return null;
  const totalMinutes = Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60000);
  if (!(totalMinutes > 0)) return null;
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

/** The dashed inter-leg divider — surfaces a flight/train/car booking that's
 * assigned to the *arriving* leg as "<type> · <from city> → <to city> ·
 * <date> · <duration>", matching web's TransportDivider. */
function TransportDivider({ booking, fromCity, toCity }: { booking: Booking; fromCity: string; toCity: string }) {
  const t = BOOKING_TYPES.find((x) => x.key === booking.type);
  const dateLabel = booking.startAt ? formatDateShort(booking.startAt) : null;
  const duration = formatDurationBetween(booking.startAt, booking.endAt);
  return (
    <View
      className="mb-2 flex-row flex-wrap items-center gap-2 rounded border border-category-transit bg-category-transit/10 px-3 py-2"
      style={{ borderStyle: "dashed" }}
    >
      <View className="h-6 w-6 items-center justify-center rounded-full bg-category-transit">
        <Ionicons name={transportIconFor(t?.iconName)} size={13} color="#fff" />
      </View>
      <Text className="text-sm font-medium text-text-primary dark:text-text-primary-dark">{t?.label ?? booking.type}</Text>
      <Text className="text-sm text-text-muted">·</Text>
      <Text className="text-sm text-text-primary dark:text-text-primary-dark">
        {fromCity} → {toCity}
      </Text>
      {dateLabel && (
        <>
          <Text className="text-sm text-text-muted">·</Text>
          <Text className="text-sm text-text-primary dark:text-text-primary-dark">{dateLabel}</Text>
        </>
      )}
      {duration && (
        <>
          <Text className="text-sm text-text-muted">·</Text>
          <Text className="text-sm text-text-primary dark:text-text-primary-dark">{duration}</Text>
        </>
      )}
    </View>
  );
}

// Material Symbols ligature names (used by core's BOOKING_TYPES) don't exist
// in Ionicons — map the transport-relevant ones to their closest equivalent.
function transportIconFor(materialIconName: string | undefined): React.ComponentProps<typeof Ionicons>["name"] {
  switch (materialIconName) {
    case "flight":
      return "airplane";
    case "train":
      return "train";
    case "directions_car":
      return "car";
    default:
      return "swap-horizontal";
  }
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
  return (a.time ?? "").localeCompare(b.time ?? "");
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
    return <Text className="text-sm text-text-muted">Place details unavailable.</Text>;
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
    <>
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

      <View className="mb-2 flex-row items-center gap-3">
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

      <View className="mb-4 flex-row items-center justify-between gap-2">
        <Button title="Save" onPress={saveSchedule} />
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
    </>
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
  onClose,
}: {
  tripId: number;
  booking: Booking | undefined;
  legs: Leg[];
  placeOptions: { id: number; name: string }[];
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

  if (!booking) {
    return <Text className="text-sm text-text-muted">Booking details unavailable.</Text>;
  }

  function save() {
    if (!booking || !title.trim()) return;
    updateBooking.update(booking.id, {
      type,
      title: title.trim(),
      confirmationCode: confirmationCode.trim() || undefined,
      flightNumber: type === "flight" ? flightNumber.trim() || undefined : undefined,
      startAt: combineDateTime(startDate, startTime),
      endAt: combineDateTime(endDate, endTime),
      price: price.trim() ? Number(price) : undefined,
      currency: currency.trim().length === 3 ? currency.trim().toUpperCase() : undefined,
      legId: legId ?? undefined,
      notes: notes.trim() || undefined,
      address: address || undefined,
      lat: lat ?? undefined,
      lng: lng ?? undefined,
      placeId: type === "hotel" ? undefined : (placeId ?? undefined),
    });
    onClose();
  }

  function remove() {
    if (!booking) return;
    removeBooking.mutate({ bookingId: booking.id });
    onClose();
  }

  return (
    <>
      <Text className="mb-1 text-sm text-text-secondary dark:text-text-secondary-dark">Type</Text>
      <SegmentedControl className="mb-3" segments={BOOKING_TYPES.map((t) => ({ value: t.key as BookingType, label: t.label }))} value={type} onChange={setType} />

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
        <>
          <Text className="mb-1 text-sm text-text-secondary dark:text-text-secondary-dark">City (optional)</Text>
          <SegmentedControl
            className="mb-3"
            segments={[{ value: "none", label: "None" }, ...legs.map((l) => ({ value: String(l.id), label: l.city }))]}
            value={legId == null ? "none" : String(legId)}
            onChange={(v) => setLegId(v === "none" ? null : Number(v))}
          />
        </>
      )}

      {/* Not offered for hotels — their own address already fills the "where
          is this" role a linked place would. Mirrors web's BookingDetailPanel. */}
      {type !== "hotel" && placeOptions.length > 0 && (
        <>
          <Text className="mb-1 text-sm text-text-secondary dark:text-text-secondary-dark">Linked place (optional)</Text>
          <SegmentedControl
            className="mb-3"
            segments={[{ value: "none", label: "None" }, ...placeOptions.map((p) => ({ value: String(p.id), label: p.name }))]}
            value={placeId == null ? "none" : String(placeId)}
            onChange={(v) => setPlaceId(v === "none" ? null : Number(v))}
          />
        </>
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
        />
      </View>

      <View className="mb-4 flex-row items-center justify-between">
        <Button title="Save" onPress={save} loading={updateBooking.isPending} disabled={!title.trim()} />
        <Button variant="danger" title="Delete" onPress={remove} />
      </View>
    </>
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
  const [addMode, setAddMode] = useState<"place" | "booking" | "activity">("place");
  const [addIdeaText, setAddIdeaText] = useState("");
  const [addDate, setAddDate] = useState("");
  const [editing, setEditing] = useState<Entry | null>(null);
  const [dateDraft, setDateDraft] = useState("");
  const [activityDraft, setActivityDraft] = useState("");
  const [collapsedLegs, setCollapsedLegs] = useState<Set<string>>(
    () => new Set([...legs.map((leg) => `leg-${leg.id}`), "pre", "post", "unscheduled"]),
  );

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

  // A flight/train/car booking assigned to a leg is treated as the transport
  // that carried the traveler INTO that leg — rendered as a dashed divider
  // between the previous leg and this one instead of as a regular list entry.
  const TRANSPORT_TYPES = new Set(["flight", "train", "car"]);
  const transportBookingByLegId = useMemo(() => {
    const map = new Map<number, Booking>();
    for (const b of bookings ?? []) {
      if (TRANSPORT_TYPES.has(b.type) && b.legId != null && !map.has(b.legId)) map.set(b.legId, b);
    }
    return map;
  }, [bookings]);

  const entries = useMemo(() => {
    const showPrivate = settings?.showPrivateItems ?? true;
    const list: Entry[] = [
      ...(bookings ?? []).map(bookingEntry),
      ...(items ?? []).map((i) => itemEntry(i, placeById)),
    ].filter((e) => showPrivate || !e.isPrivate);
    // A leg's inbound transport booking is surfaced as the divider above that
    // leg's section instead of also being listed as a plain entry.
    return list.filter(
      (e) => !(e.kind === "booking" && e.legId != null && transportBookingByLegId.get(e.legId)?.id === e.bookingId),
    );
  }, [bookings, items, placeById, settings, transportBookingByLegId]);

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

  function openAdd(legId: number | null) {
    setAddingLegId(legId);
    setAddMode("place");
    setAddIdeaText("");
    setAddDate("");
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

  function renderEntryRow(e: Entry) {
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
      </Card>
    );
  }

  return (
    <View>
      {groups.map((g) => {
        const collapsed = collapsedLegs.has(g.key);
        const isLeg = g.key.startsWith("leg-");
        const legId = isLeg ? Number(g.key.slice(4)) : null;
        const legIndex = isLeg ? sortedLegs.findIndex((l) => l.id === legId) : -1;
        const prevLeg = isLeg && legIndex > 0 ? sortedLegs[legIndex - 1] : null;
        const transportBooking = legId != null ? transportBookingByLegId.get(legId) : undefined;
        const totalCount = g.entries.length;
        const visitedCount = g.entries.filter((e) => e.completed).length;
        const categoryGroups = isLeg ? groupByCategory(g.entries) : null;
        return (
        <View key={g.key} className="mb-4">
          {prevLeg && transportBooking && (
            <TransportDivider booking={transportBooking} fromCity={prevLeg.city} toCity={g.label} />
          )}
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
                    <Text className="text-xs font-semibold uppercase tracking-wide text-text-secondary dark:text-text-secondary-dark">
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

      {/* Add place/booking/idea — opened from a city's + icon (legId preset) or
          the generic button above (no city preset), matching web's AddItemModal. */}
      <Sheet visible={addingLegId !== undefined} onClose={closeAdd}>
        {addingLegId !== undefined && (
          <>
            <Text className="mb-3 text-lg font-semibold text-text-primary dark:text-text-primary-dark">
              {addingLegId != null ? `Add to ${legs.find((l) => l.id === addingLegId)?.city ?? "trip"}` : "Add to itinerary"}
            </Text>
            <SegmentedControl
              className="mb-3"
              segments={[
                { value: "place", label: "Place" },
                { value: "booking", label: "Booking" },
                { value: "activity", label: "Idea" },
              ]}
              value={addMode}
              onChange={setAddMode}
            />
            {addMode === "place" ? (
              <AutocompleteSearch
                tripId={tripId}
                onCreated={(place) => {
                  scheduleItem.schedule({ itemType: "place", placeId: place.id, legId: addingLegId ?? undefined });
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
                <Button title="Add" onPress={saveIdea} disabled={!addIdeaText.trim()} />
              </>
            )}
          </>
        )}
      </Sheet>

      {/* Edit entry — a place gets the full detail view, a booking gets the full
          booking form, an idea gets a lightweight text + schedule editor. */}
      <Sheet visible={editing != null} onClose={() => setEditing(null)}>
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
            onClose={() => setEditing(null)}
          />
        ) : editing ? (
          <>
            <TextField
              className="mb-3"
              label="Idea"
              value={activityDraft}
              onChangeText={setActivityDraft}
            />
            <View className="mb-3">
              <TextField label="Date" value={dateDraft} onChangeText={setDateDraft} placeholder="YYYY-MM-DD" />
            </View>
            <View className="flex-row items-center justify-between gap-2">
              <Button title="Save" onPress={saveEdit} />
              <Button
                variant="secondary"
                title={editing.isPrivate ? "Make public" : "Make private"}
                onPress={() => togglePrivate(editing)}
              />
              <Button variant="danger" title="Remove" onPress={() => removeEntry(editing)} />
            </View>
          </>
        ) : null}
      </Sheet>
    </View>
  );
}
