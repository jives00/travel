"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Booking, Place } from "@travel/types";
import { todayDateString, tripDateSpan, type TimezoneSource } from "@travel/core";
import { MAP_PIN_COLORS, type MapPinGroup } from "@travel/ui-tokens";
import { travelApi } from "@/lib/api";
import { useTheme } from "@/lib/theme-context";
import { useShowCompleted } from "@/lib/itineraryPrefs";
import {
  type Entry,
  type LegOption,
  bookingEntry,
  groupByCategory,
  groupFor,
  itemEntry,
  sortEntries,
  toDateOnlyString,
} from "./itinerary-entry";
import {
  AddItemModal,
  BookingDetailPanel,
  EditItemModal,
  EntryRow,
  LegHeader,
  Modal,
  PlaceDetailPanel,
} from "./itinerary-panels";
import { TripCalendar } from "./trip-calendar";

// Modal used to live here; other pages still import it from this module.
export { Modal };

function CategoryDot({ entries }: { entries: Entry[] }) {
  const { theme } = useTheme();
  const group = entries.find((e) => e.mapPinGroup)?.mapPinGroup ?? "other";
  const color = (MAP_PIN_COLORS[group] ?? MAP_PIN_COLORS.other)[theme];
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />;
}

// The trip-scoped, flat itinerary view embedded on the trip page. Pre-Trip/
// Post-Trip/Unscheduled groups are hidden entirely when empty.
export function TripItinerary({
  tripId,
  onHoverPlace,
  onActiveLegChange,
}: {
  tripId: number;
  onHoverPlace?: (placeId: number | null) => void;
  // Fires with whichever leg's section is scrolled into view (null for
  // Pre-Trip/Post-Trip/Unscheduled, or when nothing has scrolled into the
  // tracked band yet) — lets the map's city filter follow scroll position.
  onActiveLegChange?: (legId: number | null) => void;
}) {
  const queryClient = useQueryClient();
  const { data: trip } = useQuery(travelApi.queries.tripQuery(tripId));
  const { data: items } = useQuery(travelApi.queries.itineraryQuery(tripId));
  const { data: tripPlaces } = useQuery(travelApi.queries.placesQuery({ tripId }));
  const { data: bookings } = useQuery(travelApi.queries.bookingsQuery(tripId));
  const { data: settings } = useQuery(travelApi.queries.settingsQuery());

  // List (grouped by city + category) vs Calendar (day by day). Same entries,
  // same rows — only the arrangement differs. Remembered per-trip, and loaded
  // in an effect rather than useState's initializer so the first client render
  // still matches the server-rendered HTML.
  const viewStorageKey = `travel:itinerary:view:${tripId}`;
  const [view, setView] = useState<"list" | "calendar">("list");
  useEffect(() => {
    try {
      if (window.localStorage.getItem(viewStorageKey) === "calendar") setView("calendar");
    } catch {
      // localStorage unavailable — defaults to the list view this session.
    }
  }, [viewStorageKey]);
  function selectView(next: "list" | "calendar") {
    setView(next);
    try {
      window.localStorage.setItem(viewStorageKey, next);
    } catch {
      // localStorage unavailable — the choice just won't persist.
    }
  }

  // Today's local date, read after mount so SSR and the first client render
  // agree on the markup (same shape the calendar view uses).
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(todayDateString()), []);

  // While the trip is under way the list is a to-do list, so entries checked
  // off drop out of it by default and what's left is what's still ahead.
  // Before and after the trip it's a plan or a record, so they stay visible.
  // Either way the "Show completed" toggle overrides it, remembered per trip.
  // Treated as in-progress until `today` is known: briefly under-showing beats
  // showing completed entries and then yanking them away a frame later.
  const span = trip ? tripDateSpan(trip, bookings ?? []) : null;
  const tripInProgress = today == null || (span != null && today >= span.earliest && today <= span.latest);
  const { showCompleted, toggleShowCompleted } = useShowCompleted(tripId, !tripInProgress);

  const [adding, setAdding] = useState(false);
  const [addingLegId, setAddingLegId] = useState<number | null>(null);
  const [editingEntry, setEditingEntry] = useState<Entry | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [newCity, setNewCity] = useState("");
  const [addingCity, setAddingCity] = useState(false);
  // Every section (Pre-Trip, Post-Trip, each city) expands by default; a
  // collapse choice is remembered per-trip in localStorage so it survives
  // across sessions. Keys are "pre", "post", or `leg-<id>`.
  const collapsedSectionsStorageKey = `travel:itinerary:collapsedSections:${tripId}`;
  // Starts empty (matching SSR, where there's no localStorage) so the first
  // client render matches the server-rendered HTML — reading localStorage
  // straight into useState's initializer would hydrate with different markup
  // than the server sent and produce a mismatch. The real value loads in an
  // effect right after mount instead.
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [collapsedSectionsLoaded, setCollapsedSectionsLoaded] = useState(false);
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(collapsedSectionsStorageKey);
      if (raw) setCollapsedSections(new Set(JSON.parse(raw) as string[]));
    } catch {
      // localStorage unavailable (private browsing, etc.) — falls back to
      // all-expanded for this session.
    }
    setCollapsedSectionsLoaded(true);
  }, [collapsedSectionsStorageKey]);
  useEffect(() => {
    if (!collapsedSectionsLoaded) return;
    try {
      window.localStorage.setItem(collapsedSectionsStorageKey, JSON.stringify([...collapsedSections]));
    } catch {
      // localStorage unavailable (private browsing, etc.) — collapse state
      // just won't persist this session.
    }
  }, [collapsedSections, collapsedSectionsLoaded, collapsedSectionsStorageKey]);
  function toggleSection(key: string) {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }
  // Entries mid-fade after being checked off — kept faded-in-place until the
  // animation finishes, so the fade is visible before the item jumps to the
  // bottom of the list (an instant reorder alongside the opacity change would
  // otherwise happen off in the new spot, unseen).
  const [fadingKeys, setFadingKeys] = useState<Set<string>>(new Set());
  const sectionRefs = useRef<Map<string, HTMLElement>>(new Map());

  function sectionRef(key: string) {
    return (el: HTMLElement | null) => {
      if (el) sectionRefs.current.set(key, el);
      else sectionRefs.current.delete(key);
    };
  }

  // Sorted by date now that there's no manual up/down reordering — dateless
  // legs (a dreaming trip) have nothing to sort by, so they fall back to
  // sort_order and sink after any dated legs.
  const sortedLegs = [...(trip?.legs ?? [])].sort((a, b) => {
    const ad = a.startDate ? toDateOnlyString(a.startDate) : null;
    const bd = b.startDate ? toDateOnlyString(b.startDate) : null;
    if (ad && bd) return ad.localeCompare(bd);
    if (ad) return -1;
    if (bd) return 1;
    return a.sortOrder - b.sortOrder;
  });
  const placesById = new Map<number, Place>((tripPlaces ?? []).map((p) => [p.id, p]));
  const legOptions: LegOption[] = sortedLegs.map((l) => ({ id: l.id, city: l.city }));

  // Where calendar links get their timezone: each leg carries its city's zone,
  // and the home setting covers anything with no leg to inherit from.
  const tzSource: TimezoneSource = { legs: sortedLegs, homeTimezone: settings?.homeTimezone ?? null };
  const placeOptions = (tripPlaces ?? []).map((p) => ({ id: p.id, name: p.name }));

  const hotelBookingByLegId = new Map<number, Booking>();
  for (const b of bookings ?? []) {
    if (b.type === "hotel" && b.legId != null && !hotelBookingByLegId.has(b.legId)) hotelBookingByLegId.set(b.legId, b);
  }

  // Marking complete stamps completedAt with today's local date — never
  // scheduledDate, which stays whatever the user planned so checking an entry
  // off doesn't move it into another category section. No time is tracked, per
  // spec. When checking (not unchecking), the fade plays in place for FADE_MS
  // before the list actually reorders (or, with completed hidden, drops) the
  // entry.
  const FADE_MS = 400;
  async function toggleComplete(entry: Entry) {
    const completed = !entry.completed;
    if (completed) setFadingKeys((prev) => new Set(prev).add(entry.key));
    const save =
      entry.kind === "booking" && entry.booking
        ? travelApi.bookings.update(tripId, entry.booking.id, { completed })
        : entry.item
          ? travelApi.itinerary.move(tripId, entry.item.id, {
              completed,
              completedAt: completed ? todayDateString() : null,
            })
          : undefined;
    if (!save) return;
    if (completed) {
      await Promise.all([save, new Promise((resolve) => setTimeout(resolve, FADE_MS))]);
    } else {
      await save;
    }
    await queryClient.invalidateQueries({ queryKey: entry.kind === "booking" ? ["bookings", tripId] : ["itinerary", tripId] });
    setFadingKeys((prev) => {
      const next = new Set(prev);
      next.delete(entry.key);
      return next;
    });
  }

  async function addCity(e: React.FormEvent) {
    e.preventDefault();
    if (!newCity.trim()) return;
    setAddingCity(true);
    try {
      // No dates required — a leg can exist as just a city + day count on a
      // dreaming trip, per the spec's grill-session decision.
      await travelApi.trips.addLeg(tripId, { city: newCity.trim(), dayCount: 1 });
      await queryClient.invalidateQueries({ queryKey: ["trips", tripId] });
      setNewCity("");
    } finally {
      setAddingCity(false);
    }
  }

  const datedLegs = sortedLegs.filter((l) => l.startDate && l.endDate);
  const earliestStart = datedLegs.length
    ? datedLegs.reduce((min, l) => (toDateOnlyString(l.startDate!) < min ? toDateOnlyString(l.startDate!) : min), toDateOnlyString(datedLegs[0].startDate!))
    : null;
  const latestEnd = datedLegs.length
    ? datedLegs.reduce((max, l) => (toDateOnlyString(l.endDate!) > max ? toDateOnlyString(l.endDate!) : max), toDateOnlyString(datedLegs[0].endDate!))
    : null;

  // Defaults to hidden (not shown) while settings are still loading — showing
  // private items first and then yanking them away once the real setting
  // arrives is a worse flash than briefly under-showing on first paint.
  const showPrivate = settings?.showPrivateItems ?? false;
  const allEntries: Entry[] = [
    ...(bookings ?? []).map(bookingEntry),
    ...(items ?? [])
      .filter((i) => i.itemType !== "booking")
      .map((i) => itemEntry(i, placesById))
      .filter((e) => showPrivate || !e.isPrivate),
  ];

  const groups = new Map<string, Entry[]>();
  for (const entry of allEntries) {
    // A leg's own hotel booking is already surfaced in that leg's header — don't
    // also list it as a plain activity underneath.
    if (entry.kind === "booking" && entry.legId != null && hotelBookingByLegId.get(entry.legId)?.id === entry.booking?.id) continue;
    const key = groupFor(entry, sortedLegs, earliestStart, latestEnd);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  const completedCount = allEntries.filter((e) => e.completed).length;

  // The "Show completed" filter, applied to both views off the one per-trip
  // preference — a trip you've decided to see clean should read the same way
  // whichever way you're looking at it. An entry mid-fade stays in place until
  // its animation finishes, so checking something off is still visible before
  // it drops out.
  function isVisible(entry: Entry): boolean {
    return showCompleted || !entry.completed || fadingKeys.has(entry.key);
  }
  function visible(entries: Entry[]): Entry[] {
    return showCompleted ? entries : entries.filter(isVisible);
  }

  const preEntries = visible(sortEntries(groups.get("pre") ?? []));
  const postEntries = visible(sortEntries(groups.get("post") ?? []));
  const unscheduledEntries = visible(sortEntries(groups.get("unscheduled") ?? []));

  // Scroll-spy: tracks which section (a leg, or Pre-Trip/Post-Trip/
  // Unscheduled) currently sits in a band near the top of the viewport, and
  // reports it up so the sticky map's city filter can follow scroll position.
  const legIdsKey = sortedLegs.map((l) => l.id).join(",");
  useEffect(() => {
    if (!onActiveLegChange) return;
    const elToKey = new Map<Element, string>(
      Array.from(sectionRefs.current.entries()).map(([key, el]) => [el, key]),
    );
    const intersecting = new Map<string, boolean>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const key = elToKey.get(entry.target);
          if (key) intersecting.set(key, entry.isIntersecting);
        }
        let bestKey: string | null = null;
        let bestTop = Infinity;
        for (const [key, isIn] of intersecting) {
          if (!isIn) continue;
          const top = sectionRefs.current.get(key)?.getBoundingClientRect().top;
          if (top != null && top < bestTop) {
            bestTop = top;
            bestKey = key;
          }
        }
        if (bestKey != null) {
          const legId = bestKey === "pre" || bestKey === "post" || bestKey === "unscheduled" ? null : Number(bestKey);
          onActiveLegChange(legId);
        }
      },
      // A thin trigger line at 1/3 down the viewport, rather than a band from
      // the top — a section becomes active only once it crosses that line.
      { rootMargin: "-33% 0px -66% 0px", threshold: 0 },
    );
    for (const el of sectionRefs.current.values()) observer.observe(el);
    return () => observer.disconnect();
  }, [legIdsKey, preEntries.length, postEntries.length, unscheduledEntries.length, onActiveLegChange]);

  if (!trip) return null;

  // Place entries expand inline (Wanderlog-style detail panel) instead of
  // opening the generic edit modal; booking/idea entries keep the modal.
  function renderEntry(entry: Entry) {
    if (entry.kind === "place" && expandedKey === entry.key) {
      return (
        <PlaceDetailPanel
          key={entry.key}
          tripId={tripId}
          entry={entry}
          place={entry.item?.placeId ? placesById.get(entry.item.placeId) : undefined}
          legOptions={legOptions}
          tzSource={tzSource}
          onClose={() => setExpandedKey(null)}
        />
      );
    }
    if (entry.kind === "booking" && expandedKey === entry.key) {
      return (
        <BookingDetailPanel
          key={entry.key}
          tripId={tripId}
          entry={entry}
          place={entry.booking?.placeId != null ? placesById.get(entry.booking.placeId) : undefined}
          legOptions={legOptions}
          placeOptions={placeOptions}
          tzSource={tzSource}
          onClose={() => setExpandedKey(null)}
        />
      );
    }
    return (
      <EntryRow
        key={entry.key}
        entry={entry}
        fading={fadingKeys.has(entry.key)}
        onClick={() => (entry.kind === "activity" ? setEditingEntry(entry) : setExpandedKey(entry.key))}
        onToggleComplete={toggleComplete}
        onHoverPlace={onHoverPlace}
      />
    );
  }

  const viewToggle = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex gap-1 rounded-full border border-gridline bg-surface p-1 text-sm">
        {(["list", "calendar"] as const).map((v) => (
          <button
            key={v}
            onClick={() => selectView(v)}
            aria-pressed={view === v}
            className={`flex items-center gap-1 rounded-full px-3 py-1 ${
              view === v ? "bg-category-transit text-white" : "text-text-secondary"
            }`}
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              {v === "list" ? "view_list" : "calendar_month"}
            </span>
            {v === "list" ? "List" : "Calendar"}
          </button>
        ))}
      </div>
      {completedCount > 0 && (
        <button
          onClick={toggleShowCompleted}
          aria-pressed={showCompleted}
          className="flex items-center gap-1 rounded-full border border-gridline bg-surface px-3 py-1.5 text-sm text-text-secondary hover:border-category-transit"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            {showCompleted ? "visibility_off" : "visibility"}
          </span>
          {showCompleted ? `Hide completed (${completedCount})` : `Show completed (${completedCount})`}
        </button>
      )}
    </div>
  );

  if (view === "calendar") {
    return (
      <div className="space-y-4">
        {viewToggle}
        {/* Every entry, hotels included — unlike the list view, the calendar has
            no leg header to surface a leg's lodging separately. Filtering runs
            inside the calendar rather than here, so a day can tell "nothing was
            ever planned" (Free Day) apart from "it's all checked off". */}
        <TripCalendar
          tripId={tripId}
          legs={sortedLegs}
          entries={sortEntries(allEntries)}
          isVisible={isVisible}
          hidePast={!showCompleted}
          legOptions={legOptions}
          placeOptions={placeOptions}
          renderEntry={renderEntry}
        />
        {editingEntry && (
          <EditItemModal
            tripId={tripId}
            entry={editingEntry}
            legOptions={legOptions}
            placeOptions={placeOptions}
            onClose={() => setEditingEntry(null)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {viewToggle}
      {preEntries.length > 0 && (
        <section ref={sectionRef("pre")} className="rounded border border-gridline bg-surface p-4">
          <div className="flex items-start gap-1">
            <button
              onClick={() => toggleSection("pre")}
              title={!collapsedSections.has("pre") ? "Collapse Pre-Trip" : "Expand Pre-Trip"}
              aria-label={!collapsedSections.has("pre") ? "Collapse Pre-Trip" : "Expand Pre-Trip"}
              className="mt-0.5 shrink-0 text-text-muted hover:text-text-primary"
            >
              <span className="material-symbols-outlined text-xl" aria-hidden="true">
                {!collapsedSections.has("pre") ? "expand_more" : "chevron_right"}
              </span>
            </button>
            <h3 className="mb-2 text-xl font-bold text-text-primary">Pre-Trip</h3>
          </div>
          {!collapsedSections.has("pre") && <ul className="space-y-1">{preEntries.map(renderEntry)}</ul>}
        </section>
      )}

      {sortedLegs.map((leg) => {
        const legKey = `leg-${leg.id}`;
        const expanded = !collapsedSections.has(legKey);
        const rawLegEntries = sortEntries(groups.get(legKey) ?? []);
        // Counts stay honest about the whole city even when completed entries
        // are hidden — "3/8 visited" is exactly what the hidden ones are.
        const totalCount = rawLegEntries.length;
        const visitedCount = rawLegEntries.filter((e) => e.completed).length;
        const legEntries = visible(rawLegEntries);
        const categoryGroups = groupByCategory(legEntries);
        return (
          <div key={leg.id} className="space-y-2">
            <section ref={sectionRef(String(leg.id))} className="rounded border border-gridline bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-1">
                  <button
                    onClick={() => toggleSection(legKey)}
                    title={expanded ? `Collapse ${leg.city}` : `Expand ${leg.city}`}
                    aria-label={expanded ? `Collapse ${leg.city}` : `Expand ${leg.city}`}
                    className="mt-1 shrink-0 text-text-muted hover:text-text-primary"
                  >
                    <span className="material-symbols-outlined text-xl" aria-hidden="true">
                      {expanded ? "expand_more" : "chevron_right"}
                    </span>
                  </button>
                  <LegHeader
                    tripId={tripId}
                    leg={leg}
                    hotelBooking={hotelBookingByLegId.get(leg.id)}
                    onEditHotel={(booking) => setEditingEntry(bookingEntry(booking))}
                  />
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {totalCount > 0 && (
                    <span className="text-sm font-medium text-text-secondary">
                      {visitedCount}/{totalCount} visited
                    </span>
                  )}
                  {expanded && (
                    <button
                      onClick={() => setAddingLegId(leg.id)}
                      title={`Add to ${leg.city}`}
                      aria-label={`Add to ${leg.city}`}
                      className="flex h-9 w-9 items-center justify-center rounded-full bg-category-transit text-white transition-all duration-150 hover:scale-110 hover:brightness-110 hover:shadow-md"
                    >
                      <span className="material-symbols-outlined text-xl" aria-hidden="true">
                        add
                      </span>
                    </button>
                  )}
                </div>
              </div>
              {expanded && rawLegEntries.length === 0 && <p className="text-sm text-text-muted">Nothing here yet.</p>}
              {expanded && rawLegEntries.length > 0 && legEntries.length === 0 && (
                <p className="text-sm text-text-muted">All checked off.</p>
              )}
              {expanded && legEntries.length > 0 && (
                <div className="mt-3 space-y-3">
                  {categoryGroups.map(([label, catEntries]) => {
                    const catKey = `${legKey}::cat::${label}`;
                    const catExpanded = !collapsedSections.has(catKey);
                    return (
                      <div key={label}>
                        <button onClick={() => toggleSection(catKey)} className="mb-1 flex w-full items-center gap-2 text-left">
                          <span className="material-symbols-outlined text-lg text-text-muted" aria-hidden="true">
                            {catExpanded ? "expand_more" : "chevron_right"}
                          </span>
                          <CategoryDot entries={catEntries} />
                          <span className="text-sm font-semibold uppercase tracking-wide text-text-secondary">
                            {label} ({catEntries.length})
                          </span>
                        </button>
                        {catExpanded && <ul className="space-y-1">{catEntries.map(renderEntry)}</ul>}
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        );
      })}

      <form onSubmit={addCity} className="flex gap-2">
        <input
          className="flex-1 rounded border border-gridline bg-transparent p-2 text-text-primary"
          placeholder="Add a city…"
          value={newCity}
          onChange={(e) => setNewCity(e.target.value)}
        />
        <button
          type="submit"
          disabled={addingCity}
          className="rounded bg-category-transit px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          Add city
        </button>
      </form>

      {postEntries.length > 0 && (
        <section ref={sectionRef("post")} className="rounded border border-gridline bg-surface p-4">
          <div className="flex items-start gap-1">
            <button
              onClick={() => toggleSection("post")}
              title={!collapsedSections.has("post") ? "Collapse Post-Trip" : "Expand Post-Trip"}
              aria-label={!collapsedSections.has("post") ? "Collapse Post-Trip" : "Expand Post-Trip"}
              className="mt-0.5 shrink-0 text-text-muted hover:text-text-primary"
            >
              <span className="material-symbols-outlined text-xl" aria-hidden="true">
                {!collapsedSections.has("post") ? "expand_more" : "chevron_right"}
              </span>
            </button>
            <h3 className="mb-2 text-xl font-bold text-text-primary">Post-Trip</h3>
          </div>
          {!collapsedSections.has("post") && <ul className="space-y-1">{postEntries.map(renderEntry)}</ul>}
        </section>
      )}

      {unscheduledEntries.length > 0 && (
        <section ref={sectionRef("unscheduled")} className="rounded border border-gridline bg-surface p-4">
          <h3 className="mb-2 font-medium text-text-primary">Unscheduled</h3>
          <ul className="space-y-1">
            {unscheduledEntries.map(renderEntry)}
          </ul>
        </section>
      )}

      <button
        onClick={() => setAdding(true)}
        className="rounded bg-category-transit px-4 py-2 text-sm font-medium text-white"
      >
        + Add to itinerary
      </button>

      {adding && (
        <AddItemModal tripId={tripId} legOptions={legOptions} placeOptions={placeOptions} onClose={() => setAdding(false)} />
      )}
      {addingLegId != null && (
        <AddItemModal
          tripId={tripId}
          legOptions={legOptions}
          placeOptions={placeOptions}
          defaultLegId={addingLegId}
          onClose={() => setAddingLegId(null)}
        />
      )}
      {editingEntry && (
        <EditItemModal
          tripId={tripId}
          entry={editingEntry}
          legOptions={legOptions}
          placeOptions={placeOptions}
          onClose={() => setEditingEntry(null)}
        />
      )}
    </div>
  );
}
