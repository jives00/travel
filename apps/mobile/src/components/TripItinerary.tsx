import { useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { Booking, ItineraryItem, Leg, Place } from "@travel/types";
import { BOOKING_TYPES, PLACE_TAGS, enumLabel } from "@travel/core";
import { travelApi } from "../lib/api";
import { useScheduleItem, useUnscheduleItem, useMoveItem } from "../lib/offlineMutations/itinerary";
import { useRemoveBooking } from "../lib/offlineMutations/bookings";
import { AutocompleteSearch } from "./AutocompleteSearch";
import { BookingForm } from "./BookingForm";
import { Card, Button, TextField, Sheet } from "./ui";

interface Entry {
  key: string;
  kind: "booking" | "place" | "activity";
  legId: number | null;
  scheduledDate: string | null;
  time: string | null;
  title: string;
  subtitle: string;
  isPrivate: boolean;
  itemId?: number; // itinerary item id (place/activity)
  bookingId?: number;
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
    bookingId: b.id,
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
    itemId: i.id,
  };
}

function sortEntries(a: Entry, b: Entry): number {
  if (a.scheduledDate && b.scheduledDate && a.scheduledDate !== b.scheduledDate)
    return a.scheduledDate < b.scheduledDate ? -1 : 1;
  if (a.scheduledDate && !b.scheduledDate) return -1;
  if (!a.scheduledDate && b.scheduledDate) return 1;
  return (a.time ?? "").localeCompare(b.time ?? "");
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
  const removeBooking = useRemoveBooking(tripId);

  const [ideaText, setIdeaText] = useState("");
  const [addingPlace, setAddingPlace] = useState(false);
  const [addingBooking, setAddingBooking] = useState(false);
  const [editing, setEditing] = useState<Entry | null>(null);
  const [dateDraft, setDateDraft] = useState("");
  const [timeDraft, setTimeDraft] = useState("");

  const placeById = useMemo(() => new Map((places ?? []).map((p) => [p.id, p])), [places]);

  const entries = useMemo(() => {
    const showPrivate = settings?.showPrivateItems ?? true;
    const list: Entry[] = [
      ...(bookings ?? []).map(bookingEntry),
      ...(items ?? []).map((i) => itemEntry(i, placeById)),
    ].filter((e) => showPrivate || !e.isPrivate);
    return list;
  }, [bookings, items, placeById, settings]);

  // Group by leg (null last).
  const groups: { leg: Leg | null; entries: Entry[] }[] = [
    ...legs.map((leg) => ({ leg, entries: entries.filter((e) => e.legId === leg.id).sort(sortEntries) })),
    { leg: null, entries: entries.filter((e) => e.legId == null).sort(sortEntries) },
  ].filter((g) => g.entries.length > 0 || g.leg != null);

  function addIdea() {
    if (!ideaText.trim()) return;
    scheduleItem.schedule({ itemType: "activity", activityText: ideaText.trim() });
    setIdeaText("");
  }

  function openEdit(e: Entry) {
    setEditing(e);
    setDateDraft(e.scheduledDate ?? "");
    setTimeDraft(e.time ?? "");
  }

  function saveEdit() {
    if (!editing?.itemId) return setEditing(null);
    move.mutate({
      itemId: editing.itemId,
      body: {
        scheduledDate: dateDraft.trim() || null,
        time: (timeDraft.trim() as `${string}:${string}`) || null,
      },
    });
    setEditing(null);
  }

  function removeEntry(e: Entry) {
    if (e.bookingId != null) removeBooking.mutate({ bookingId: e.bookingId });
    else if (e.itemId != null) unschedule.mutate({ itemId: e.itemId });
    setEditing(null);
  }

  function togglePrivate(e: Entry) {
    if (e.itemId != null) move.mutate({ itemId: e.itemId, body: { isPrivate: !e.isPrivate } });
    setEditing(null);
  }

  return (
    <View>
      {groups.map((g) => (
        <View key={g.leg?.id ?? "unscheduled"} className="mb-4">
          <Text className="mb-2 text-sm font-semibold text-text-primary dark:text-text-primary-dark">
            {g.leg ? g.leg.city : "Not assigned to a city"}
          </Text>
          {g.entries.length === 0 ? (
            <Text className="mb-2 text-xs text-text-muted">Nothing scheduled here yet.</Text>
          ) : (
            g.entries.map((e) => (
              <Pressable key={e.key} onPress={() => openEdit(e)}>
                <Card className="mb-2 flex-row items-center justify-between">
                  <View className="flex-1">
                    <Text className="text-text-primary dark:text-text-primary-dark">
                      {e.isPrivate ? "🔒 " : ""}
                      {e.title}
                    </Text>
                    <Text className="text-xs text-text-muted">
                      {e.subtitle}
                      {e.scheduledDate ? ` · ${e.scheduledDate}${e.time ? ` ${e.time}` : ""}` : ""}
                    </Text>
                  </View>
                </Card>
              </Pressable>
            ))
          )}
        </View>
      ))}

      {/* Add controls */}
      <View className="mb-2 flex-row gap-2">
        <TextField
          className="flex-1"
          placeholder="Add an idea…"
          value={ideaText}
          onChangeText={setIdeaText}
          onSubmitEditing={addIdea}
          returnKeyType="done"
        />
        <Button title="Idea" variant="secondary" onPress={addIdea} />
      </View>
      <View className="flex-row gap-2">
        <Button className="flex-1" title="+ Place" variant="secondary" onPress={() => setAddingPlace(true)} />
        <Button className="flex-1" title="+ Booking" variant="secondary" onPress={() => setAddingBooking(true)} />
      </View>

      {/* Add place: create/select a place, then schedule it onto the itinerary */}
      <Sheet visible={addingPlace} onClose={() => setAddingPlace(false)}>
        <Text className="mb-3 text-lg font-semibold text-text-primary dark:text-text-primary-dark">Add place</Text>
        <AutocompleteSearch
          tripId={tripId}
          onCreated={(place) => {
            scheduleItem.schedule({ itemType: "place", placeId: place.id });
            setAddingPlace(false);
          }}
          onCancel={() => setAddingPlace(false)}
        />
      </Sheet>

      {/* Add booking */}
      <Sheet visible={addingBooking} onClose={() => setAddingBooking(false)}>
        <BookingForm tripId={tripId} legs={legs} onSaved={() => setAddingBooking(false)} />
      </Sheet>

      {/* Edit entry */}
      <Sheet visible={editing != null} onClose={() => setEditing(null)}>
        {editing && (
          <>
            <Text className="mb-3 text-lg font-semibold text-text-primary dark:text-text-primary-dark">{editing.title}</Text>
            {editing.kind !== "booking" && (
              <>
                <View className="mb-3 flex-row gap-2">
                  <TextField className="flex-1" label="Date" value={dateDraft} onChangeText={setDateDraft} placeholder="YYYY-MM-DD" />
                  <TextField className="flex-1" label="Time" value={timeDraft} onChangeText={setTimeDraft} placeholder="HH:mm" />
                </View>
                <Button className="mb-2" title="Save schedule" onPress={saveEdit} />
                <Button
                  className="mb-2"
                  variant="secondary"
                  title={editing.isPrivate ? "Make public" : "Make private"}
                  onPress={() => togglePrivate(editing)}
                />
              </>
            )}
            <Button variant="danger" title="Remove" onPress={() => removeEntry(editing)} />
          </>
        )}
      </Sheet>
    </View>
  );
}
