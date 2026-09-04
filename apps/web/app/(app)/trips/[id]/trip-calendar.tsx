"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { DayNote } from "@travel/types";
import { buildTripDays, formatDayHeading, type TripDay } from "@travel/core";
import { travelApi } from "@/lib/api";
import { entryDisplayDate, type Entry, type LegOption } from "./itinerary-entry";
import { AddItemModal } from "./itinerary-panels";

// Day-by-day schedule view of the itinerary — the same entries the grouped list
// shows, laid out against every calendar day of the trip instead of by city and
// category. Days with nothing scheduled read as "Free Day" and can carry a note
// ("go see the west side of the city"), so an empty day is still a plan.
//
// Renders entries through the `renderEntry` callback the list view already uses,
// so an entry looks and behaves identically in both views (same inline detail
// panels, same check-off).

function DayNoteEditor({ tripId, date, note }: { tripId: number; date: string; note: string }) {
  const queryClient = useQueryClient();
  const [value, setValue] = useState(note);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);

  // A note edited elsewhere (or refetched) should win once this field isn't
  // being typed in — otherwise the local copy would go stale after any
  // invalidation.
  useEffect(() => {
    if (!editing) setValue(note);
  }, [note, editing]);

  async function save() {
    setEditing(false);
    if (value.trim() === note) return;
    setSaving(true);
    try {
      await travelApi.dayNotes.set(tripId, date, { note: value });
      await queryClient.invalidateQueries({ queryKey: ["dayNotes", tripId] });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-start gap-2">
      <span className="material-symbols-outlined mt-1 text-base text-text-muted" aria-hidden="true">
        edit_note
      </span>
      <textarea
        className="min-h-[2.25rem] w-full resize-y rounded border border-transparent bg-transparent p-1 text-sm text-text-secondary hover:border-gridline focus:border-gridline focus:outline-none"
        rows={value ? 2 : 1}
        value={value}
        placeholder="Add a note for this day…"
        aria-label={`Note for ${formatDayHeading(date)}`}
        onChange={(e) => setValue(e.target.value)}
        onFocus={() => setEditing(true)}
        onBlur={save}
      />
      {saving && <span className="mt-1 shrink-0 text-xs text-text-muted">Saving…</span>}
    </div>
  );
}

function DayRow({
  tripId,
  day,
  entries,
  note,
  renderEntry,
  onAdd,
  isToday,
}: {
  tripId: number;
  day: TripDay;
  entries: Entry[];
  note: string;
  renderEntry: (entry: Entry) => React.ReactNode;
  onAdd: () => void;
  isToday: boolean;
}) {
  const free = entries.length === 0;
  return (
    <section
      className={`rounded border bg-surface p-4 ${isToday ? "border-category-transit" : "border-gridline"}`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="flex items-center gap-2 text-lg font-bold text-text-primary">
            {formatDayHeading(day.date)}
            {isToday && (
              <span className="rounded-full bg-category-transit px-2 py-0.5 text-xs font-medium text-white">
                Today
              </span>
            )}
          </h3>
          <p className="text-sm text-text-secondary">
            Day {day.dayNumber}
            {day.city ? ` · ${day.city}` : " · Between cities"}
          </p>
        </div>
        <button
          onClick={onAdd}
          title={`Add to ${formatDayHeading(day.date)}`}
          aria-label={`Add to ${formatDayHeading(day.date)}`}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-category-transit text-white transition-all duration-150 hover:scale-110 hover:brightness-110 hover:shadow-md"
        >
          <span className="material-symbols-outlined text-xl" aria-hidden="true">
            add
          </span>
        </button>
      </div>

      {free ? (
        <p className="mb-2 text-sm font-medium uppercase tracking-wide text-text-muted">Free Day</p>
      ) : (
        <ul className="mb-2 space-y-1">{entries.map(renderEntry)}</ul>
      )}

      <DayNoteEditor tripId={tripId} date={day.date} note={note} />
    </section>
  );
}

/** Dated entries that fall outside the trip's own day span (an early flight, a
 * post-trip dinner) and undated ones — shown below the calendar so nothing is
 * silently missing from this view. */
function ExtraSection({ title, entries, renderEntry }: { title: string; entries: Entry[]; renderEntry: (e: Entry) => React.ReactNode }) {
  if (entries.length === 0) return null;
  return (
    <section className="rounded border border-gridline bg-surface p-4">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-text-muted">
        {title} ({entries.length})
      </h3>
      <ul className="space-y-1">{entries.map(renderEntry)}</ul>
    </section>
  );
}

export function TripCalendar({
  tripId,
  legs,
  entries,
  legOptions,
  placeOptions,
  renderEntry,
}: {
  tripId: number;
  legs: { id: number; city: string; startDate: string | null; endDate: string | null }[];
  /** Already sorted and privacy-filtered by the parent. */
  entries: Entry[];
  legOptions: LegOption[];
  placeOptions: { id: number; name: string }[];
  renderEntry: (entry: Entry) => React.ReactNode;
}) {
  const { data: notes } = useQuery(travelApi.queries.dayNotesQuery(tripId));
  const [addingDay, setAddingDay] = useState<TripDay | null>(null);

  // Today, as a date-only string in the viewer's own timezone — compared
  // against the UTC-normalized day strings the same way everywhere else.
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => {
    const d = new Date();
    setToday(
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`,
    );
  }, []);

  const days = buildTripDays(legs as Parameters<typeof buildTripDays>[0]);

  if (days.length === 0) {
    return (
      <p className="rounded border border-gridline bg-surface p-4 text-sm text-text-muted">
        No dates yet — give a city a start and end date and the calendar will fill in day by day.
      </p>
    );
  }

  const noteByDate = new Map<string, string>(
    (notes ?? []).map((n: DayNote) => [n.date.length > 10 ? n.date.slice(0, 10) : n.date, n.note]),
  );

  const first = days[0].date;
  const last = days[days.length - 1].date;
  const byDate = new Map<string, Entry[]>();
  const before: Entry[] = [];
  const after: Entry[] = [];
  const undated: Entry[] = [];
  for (const entry of entries) {
    // Completed-but-never-scheduled entries land on the day they were checked
    // off — the calendar is the "when did this happen" view, so nothing that
    // actually happened should fall into "Not scheduled to a day".
    const date = entryDisplayDate(entry);
    if (!date) {
      undated.push(entry);
    } else if (date < first) {
      before.push(entry);
    } else if (date > last) {
      after.push(entry);
    } else {
      byDate.set(date, [...(byDate.get(date) ?? []), entry]);
    }
  }

  return (
    <div className="space-y-3">
      <ExtraSection title="Before the trip" entries={before} renderEntry={renderEntry} />

      {days.map((day) => (
        <DayRow
          key={day.date}
          tripId={tripId}
          day={day}
          entries={byDate.get(day.date) ?? []}
          note={noteByDate.get(day.date) ?? ""}
          renderEntry={renderEntry}
          onAdd={() => setAddingDay(day)}
          isToday={today === day.date}
        />
      ))}

      <ExtraSection title="After the trip" entries={after} renderEntry={renderEntry} />
      <ExtraSection title="Not scheduled to a day" entries={undated} renderEntry={renderEntry} />

      {addingDay && (
        <AddItemModal
          tripId={tripId}
          legOptions={legOptions}
          placeOptions={placeOptions}
          defaultLegId={addingDay.legId ?? undefined}
          defaultDate={addingDay.date}
          dayLabel={formatDayHeading(addingDay.date)}
          unscheduledEntries={undated}
          onClose={() => setAddingDay(null)}
        />
      )}
    </div>
  );
}
