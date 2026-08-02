import { useEffect, useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useQuery } from "@tanstack/react-query";
import type { DayNote, Leg } from "@travel/types";
import { buildTripDays, formatDayHeading, todayDateString, type TripDay } from "@travel/core";
import { travelApi } from "../lib/api";
import { useSetDayNote } from "../lib/offlineMutations/dayNotes";
import { Card, TextField } from "./ui";
import type { Entry } from "./TripItinerary";

// Day-by-day schedule view — mirrors web's trip-calendar.tsx. The same entries
// the grouped list shows, laid against every calendar day of the trip instead of
// by city and category. A day with nothing on it reads "Free Day" and still
// takes a note ("go see the west side of the city"), so an empty day is a plan
// rather than a blank.
//
// Entries render through the `renderEntry` callback TripItinerary already uses
// for its list, so a card looks and behaves identically in both views (same
// check-off, same tap-to-edit, same Maps button).

function dayOf(d: string): string {
  return d.length > 10 ? d.slice(0, 10) : d;
}

function DayNoteEditor({ tripId, date, note }: { tripId: number; date: string; note: string }) {
  const setNote = useSetDayNote(tripId);
  const [value, setValue] = useState(note);
  const [editing, setEditing] = useState(false);

  // A note that changed underneath us (sync, or an edit on web) should win once
  // this field isn't being typed in — otherwise the local copy goes stale.
  useEffect(() => {
    if (!editing) setValue(note);
  }, [note, editing]);

  function save() {
    setEditing(false);
    if (value.trim() === note.trim()) return;
    setNote.mutate({ tripId, date, note: value });
  }

  return (
    <TextField
      label="Notes"
      value={value}
      onChangeText={setValue}
      onFocus={() => setEditing(true)}
      onBlur={save}
      placeholder="Add a note for this day…"
      multiline
      numberOfLines={2}
      scrollEnabled={false}
    />
  );
}

function DayRow({
  tripId,
  day,
  entries,
  note,
  isToday,
  renderEntry,
  onAdd,
}: {
  tripId: number;
  day: TripDay;
  entries: Entry[];
  note: string;
  isToday: boolean;
  renderEntry: (entry: Entry) => React.ReactNode;
  onAdd: () => void;
}) {
  return (
    <View className="mb-4">
      <View className="mb-2 flex-row items-center justify-between gap-2">
        <View className="flex-1">
          <View className="flex-row items-center gap-2">
            <Text className="text-lg font-bold text-text-primary dark:text-text-primary-dark">
              {formatDayHeading(day.date)}
            </Text>
            {isToday && (
              <View className="rounded-full bg-category-transit px-2 py-0.5">
                <Text className="text-xs font-medium text-white">Today</Text>
              </View>
            )}
          </View>
          <Text className="text-xs text-text-muted">
            Day {day.dayNumber}
            {day.city ? ` · ${day.city}` : " · Between cities"}
          </Text>
        </View>
        <Pressable
          onPress={onAdd}
          accessibilityLabel={`Add to ${formatDayHeading(day.date)}`}
          className="h-8 w-8 items-center justify-center rounded-full bg-category-transit"
        >
          <Ionicons name="add" size={20} color="#fff" />
        </Pressable>
      </View>

      {entries.length === 0 ? (
        <Text className="mb-2 text-xs font-semibold uppercase tracking-wide text-text-muted">Free Day</Text>
      ) : (
        entries.map(renderEntry)
      )}

      <DayNoteEditor tripId={tripId} date={day.date} note={note} />
    </View>
  );
}

/** Dated entries falling outside the trip's own day span (an early flight, a
 * post-trip dinner) and undated ones — kept below the calendar so this view
 * never silently hides something the list would show. */
function ExtraSection({
  title,
  entries,
  renderEntry,
}: {
  title: string;
  entries: Entry[];
  renderEntry: (entry: Entry) => React.ReactNode;
}) {
  if (entries.length === 0) return null;
  return (
    <View className="mb-4">
      <Text className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-secondary dark:text-text-secondary-dark">
        {title} ({entries.length})
      </Text>
      {entries.map(renderEntry)}
    </View>
  );
}

export function TripCalendar({
  tripId,
  legs,
  entries,
  renderEntry,
  onAddToDay,
}: {
  tripId: number;
  /** Already sorted by start date by the caller — buildTripDays resolves an
   * overlapping day to the first matching leg. */
  legs: Leg[];
  /** Already privacy-filtered and sorted by the caller. */
  entries: Entry[];
  renderEntry: (entry: Entry) => React.ReactNode;
  onAddToDay: (day: TripDay) => void;
}) {
  const { data: notes } = useQuery(travelApi.queries.dayNotesQuery(tripId));
  const days = useMemo(() => buildTripDays(legs), [legs]);
  const today = todayDateString();

  const noteByDate = useMemo(
    () => new Map((notes ?? []).map((n: DayNote) => [dayOf(n.date), n.note])),
    [notes],
  );

  const buckets = useMemo(() => {
    const byDate = new Map<string, Entry[]>();
    const before: Entry[] = [];
    const after: Entry[] = [];
    const undated: Entry[] = [];
    if (days.length === 0) return { byDate, before, after, undated };
    const first = days[0].date;
    const last = days[days.length - 1].date;
    for (const entry of entries) {
      if (!entry.scheduledDate) undated.push(entry);
      else if (entry.scheduledDate < first) before.push(entry);
      else if (entry.scheduledDate > last) after.push(entry);
      else byDate.set(entry.scheduledDate, [...(byDate.get(entry.scheduledDate) ?? []), entry]);
    }
    return { byDate, before, after, undated };
  }, [entries, days]);

  if (days.length === 0) {
    return (
      <Card>
        <Text className="text-sm text-text-muted">
          No dates yet — give a city a start and end date and the calendar will fill in day by day.
        </Text>
      </Card>
    );
  }

  return (
    <View>
      <ExtraSection title="Before the trip" entries={buckets.before} renderEntry={renderEntry} />

      {days.map((day) => (
        <DayRow
          key={day.date}
          tripId={tripId}
          day={day}
          entries={buckets.byDate.get(day.date) ?? []}
          note={noteByDate.get(day.date) ?? ""}
          isToday={today === day.date}
          renderEntry={renderEntry}
          onAdd={() => onAddToDay(day)}
        />
      ))}

      <ExtraSection title="After the trip" entries={buckets.after} renderEntry={renderEntry} />
      <ExtraSection title="Not scheduled to a day" entries={buckets.undated} renderEntry={renderEntry} />
    </View>
  );
}
