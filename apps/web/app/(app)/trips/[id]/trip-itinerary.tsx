"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Booking, ItineraryItem, Leg, Place, PlaceTag } from "@travel/types";
import { BOOKING_TYPES, PLACE_TAGS, enumLabel, mapPinGroupForTag, mapPinGroupForBookingType, todayDateString } from "@travel/core";
import { MAP_PIN_COLORS, type MapPinGroup } from "@travel/ui-tokens";
import { travelApi } from "@/lib/api";
import { useTheme } from "@/lib/theme-context";
import {
  BookingFields,
  type BookingFormState,
  EMPTY_FORM as EMPTY_BOOKING_FORM,
  formToBody as bookingFormToBody,
  bookingToForm,
} from "@/components/booking-fields";
import { AutocompleteSearch, type AutocompleteSearchHandle, type AutocompleteSearchState } from "@/components/autocomplete-search";

// A leg (city) association and a real date/time are both optional and
// independent for itinerary items (see packages/types itinerary.ts) — no more
// mandatory leg + relative day-index, and no more day-by-day grid. Bookings and
// itinerary items (places/ideas) are merged into one flat, grouped list.
function toDateOnlyString(d: string): string {
  return d.length > 10 ? d.slice(0, 10) : d;
}

function dateOnly(d: string): Date {
  return new Date(`${toDateOnlyString(d)}T00:00:00Z`);
}

// "HH:mm" (24h, as stored/edited) -> "7:00 PM" for display — same literal
// wall-clock convention used everywhere else (timeZone: "UTC" pins the
// formatter so it doesn't reinterpret through the browser's local offset).
function formatTime12h(hhmm: string): string {
  return new Date(`2000-01-01T${hhmm}:00Z`).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  });
}

function formatDate(d: string): string {
  return dateOnly(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function formatDateRange(start: string, end: string): string {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function formatDateShort(d: string): string {
  return dateOnly(toDateOnlyString(d)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
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

type EntryKind = "booking" | "place" | "activity";

interface Entry {
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
  // Human-readable grouping label used only by the "Category" sort mode —
  // a place's primary tag, a booking's type, or "Idea".
  categoryLabel: string;
  // Set only for place entries — same map-pin color grouping used on the
  // trip map, so a place's icon circle matches its marker there.
  mapPinGroup?: MapPinGroup;
  booking?: Booking;
  item?: ItineraryItem;
}

function bookingEntry(b: Booking): Entry {
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
    // A "Tour / Activity" booking reads the same as a day-trip place to a
    // traveler planning their itinerary — grouped into "Day Trips & Tours"
    // here rather than standing alone (see itineraryCategoryLabel below).
    categoryLabel: b.type === "activity" ? "Day Trips & Tours" : (bookingType?.label ?? b.type),
    mapPinGroup: mapPinGroupForBookingType(b.type) as MapPinGroup,
    booking: b,
  };
}

// Itinerary-only category grouping label — "activity" (Tour / Activity) and
// "day_trip" both read as trip-planning outings to a traveler, so they're
// merged into one section here even though they stay distinct tags
// elsewhere (map pins, the place editor's tag dropdown, etc).
function itineraryCategoryLabel(tag: PlaceTag | null | undefined, fallbackLabel: string): string {
  if (tag === "activity" || tag === "day_trip") return "Day Trips & Tours";
  return fallbackLabel;
}

function itemEntry(i: ItineraryItem, placesById: Map<number, Place>): Entry {
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
    categoryLabel: isPlace ? itineraryCategoryLabel(place?.primaryTag, placeTag?.label ?? "Uncategorized") : "Idea",
    mapPinGroup: isPlace ? (mapPinGroupForTag(place?.primaryTag) as MapPinGroup) : undefined,
    item: i,
  };
}

/** Which group an entry belongs to: an explicit leg wins; otherwise a real date
 * either matches a leg's own range (auto-placed there), falls before the
 * earliest leg (Pre-Trip), after the latest (Post-Trip), or — with no leg and
 * no date at all — Unscheduled. */
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

function sortEntries(entries: Entry[]): Entry[] {
  return [...entries].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    const ad = a.scheduledDate ?? "zzzz";
    const bd = b.scheduledDate ?? "zzzz";
    if (ad !== bd) return ad.localeCompare(bd);
    const at = a.time ?? "zz:zz";
    const bt = b.time ?? "zz:zz";
    if (at !== bt) return at.localeCompare(bt);
    return a.title.localeCompare(b.title);
  });
}

/** Buckets already-sorted entries by their category label, in alphabetical
 * label order — drives the collapsible category sections within a leg. */
function groupByCategory(entries: Entry[]): [string, Entry[]][] {
  const map = new Map<string, Entry[]>();
  for (const entry of entries) map.set(entry.categoryLabel, [...(map.get(entry.categoryLabel) ?? []), entry]);
  return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

function CategoryDot({ entries }: { entries: Entry[] }) {
  const { theme } = useTheme();
  const group = entries.find((e) => e.mapPinGroup)?.mapPinGroup ?? "other";
  const color = (MAP_PIN_COLORS[group] ?? MAP_PIN_COLORS.other)[theme];
  return <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />;
}

/** The dashed inter-leg divider — surfaces a flight/train/car booking that's
 * assigned to the *arriving* leg as "<type> · <from city> → <to city> · <date>
 * · <duration>", Wanderlog-style. There's no dedicated transport entity; a
 * booking already carries a single legId, so we treat "the transport booking
 * on leg B" as the trip from the previous leg into B. */
function TransportDivider({ booking, fromCity, toCity }: { booking: Booking; fromCity: string; toCity: string }) {
  const bookingType = BOOKING_TYPES.find((t) => t.key === booking.type);
  const dateLabel = booking.startAt ? formatDateShort(booking.startAt) : null;
  const duration = formatDurationBetween(booking.startAt, booking.endAt);
  return (
    <div className="flex items-center gap-2 rounded border border-dashed border-category-transit bg-category-transit/10 px-3 py-2 text-sm text-text-primary">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-category-transit text-white">
        <span className="material-symbols-outlined text-sm" aria-hidden="true">
          {bookingType?.iconName ?? "directions_transit"}
        </span>
      </span>
      <span className="font-medium">{bookingType?.label ?? booking.type}</span>
      <span className="text-text-muted">·</span>
      <span>
        {fromCity} → {toCity}
      </span>
      {dateLabel && (
        <>
          <span className="text-text-muted">·</span>
          <span>{dateLabel}</span>
        </>
      )}
      {duration && (
        <>
          <span className="text-text-muted">·</span>
          <span>{duration}</span>
        </>
      )}
    </div>
  );
}

export function Modal({
  onClose,
  wide,
  children,
}: {
  onClose: () => void;
  wide?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className={`max-h-[90vh] w-full ${wide ? "max-w-2xl" : "max-w-lg"} overflow-y-auto overflow-x-hidden rounded bg-page p-4 shadow-lg`}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}

function EntryRow({
  entry,
  fading,
  onClick,
  onToggleComplete,
  onHoverPlace,
}: {
  entry: Entry;
  // True for the brief window between checking the box and the list actually
  // reordering the entry to the bottom — see toggleComplete in TripItinerary.
  fading?: boolean;
  onClick: () => void;
  onToggleComplete?: (entry: Entry) => void;
  onHoverPlace?: (placeId: number | null) => void;
}) {
  // Every entry kind can be checked off done/visited now.
  const completable = true;
  const done = entry.completed || fading;

  return (
    <li
      onMouseEnter={() => entry.placeId != null && onHoverPlace?.(entry.placeId)}
      onMouseLeave={() => entry.placeId != null && onHoverPlace?.(null)}
    >
      <div
        className={`flex items-start gap-2 rounded border border-gridline bg-surface p-2 transition-opacity duration-500 hover:border-category-transit ${done ? "opacity-50" : "opacity-100"}`}
      >
        {completable && (
          <input
            type="checkbox"
            checked={done}
            onChange={() => onToggleComplete?.(entry)}
            title={done ? "Mark not visited" : "Mark visited"}
            aria-label={done ? "Mark not visited" : "Mark visited"}
            className="mt-0.5 h-5 w-5 shrink-0 accent-category-transit"
          />
        )}
        <button onClick={onClick} className="flex min-w-0 flex-1 items-center gap-3 text-left text-sm">
          <div className="min-w-0 flex-1 space-y-0.5">
            <span className="flex items-center justify-between gap-2">
              <span className={`flex items-center gap-2 text-base font-medium text-text-primary ${done ? "line-through" : ""}`}>
                {entry.title}
                {entry.isPrivate && (
                  <span className="material-symbols-outlined text-sm text-text-muted" title="Private" aria-label="Private">
                    lock
                  </span>
                )}
              </span>
              <span className="shrink-0 text-xs text-text-muted">
                {entry.scheduledDate
                  ? new Date(`${entry.scheduledDate}T00:00:00Z`).toLocaleDateString("en-US", {
                      month: "long",
                      day: "numeric",
                      timeZone: "UTC",
                    })
                  : ""}
                {entry.kind === "booking" && entry.time ? ` · ${formatTime12h(entry.time)}` : ""}
              </span>
            </span>
            {entry.description && <span className="line-clamp-2 text-sm text-text-muted">{entry.description}</span>}
          </div>
        </button>
      </div>
    </li>
  );
}

interface LegOption {
  id: number;
  city: string;
}

function IdeaOrPlaceFields({
  kind,
  tripId,
  legOptions,
  legId,
  setLegId,
  scheduledDate,
  setScheduledDate,
  activityText,
  setActivityText,
  isPrivate,
  setIsPrivate,
  onPlaceCreated,
  placeSearchRef,
  onPlaceStateChange,
}: {
  kind: "activity" | "place";
  tripId: number;
  legOptions: LegOption[];
  legId: string;
  setLegId: (v: string) => void;
  scheduledDate: string;
  setScheduledDate: (v: string) => void;
  activityText: string;
  setActivityText: (v: string) => void;
  isPrivate: boolean;
  setIsPrivate: (v: boolean) => void;
  onPlaceCreated: (place: Place) => void;
  placeSearchRef: React.RefObject<AutocompleteSearchHandle | null>;
  onPlaceStateChange: (state: AutocompleteSearchState | null) => void;
}) {
  return (
    <div className="space-y-2">
      {kind === "activity" ? (
        <input
          className="w-full rounded border border-gridline bg-transparent p-2 text-text-primary"
          placeholder="Idea (e.g. Try the ramen place near the hotel)"
          value={activityText}
          onChange={(e) => setActivityText(e.target.value)}
        />
      ) : (
        <AutocompleteSearch
          ref={placeSearchRef}
          tripId={tripId}
          onCreated={onPlaceCreated}
          hideActions
          onStateChange={onPlaceStateChange}
          autoFocus
        />
      )}
      <div className="flex gap-2">
        <select
          className="flex-1 rounded border border-gridline bg-transparent p-2 text-text-primary"
          value={legId}
          onChange={(e) => setLegId(e.target.value)}
        >
          <option value="">No city</option>
          {legOptions.map((l) => (
            <option key={l.id} value={l.id}>
              {l.city}
            </option>
          ))}
        </select>
      </div>
      <label className="block text-xs text-text-muted">
        Date (optional)
        <input
          type="date"
          className="w-full rounded border border-gridline bg-transparent p-1 text-text-primary"
          value={scheduledDate}
          onChange={(e) => setScheduledDate(e.target.value)}
        />
      </label>
      <label className="flex items-center gap-2 text-sm text-text-secondary">
        <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
        Private
      </label>
    </div>
  );
}

function AddItemModal({
  tripId,
  legOptions,
  placeOptions,
  defaultLegId,
  onClose,
}: {
  tripId: number;
  legOptions: LegOption[];
  placeOptions: { id: number; name: string }[];
  defaultLegId?: number;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"booking" | "activity" | "place">("place");
  const [saving, setSaving] = useState(false);

  const defaultLegIdStr = defaultLegId != null ? String(defaultLegId) : "";
  const [bookingForm, setBookingForm] = useState<BookingFormState>(() => ({ ...EMPTY_BOOKING_FORM, legId: defaultLegIdStr }));
  const [legId, setLegId] = useState(defaultLegIdStr);
  const [scheduledDate, setScheduledDate] = useState("");
  const [activityText, setActivityText] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const placeSearchRef = useRef<AutocompleteSearchHandle>(null);
  const [placeState, setPlaceState] = useState<AutocompleteSearchState | null>(null);

  async function save() {
    setSaving(true);
    try {
      if (mode === "booking") {
        await travelApi.bookings.create(tripId, bookingFormToBody(bookingForm));
        await queryClient.invalidateQueries({ queryKey: ["bookings", tripId] });
      } else {
        await travelApi.itinerary.schedule(tripId, {
          itemType: mode,
          activityText: mode === "activity" ? activityText.trim() || undefined : undefined,
          legId: legId ? Number(legId) : undefined,
          scheduledDate: scheduledDate || undefined,
          isPrivate,
        });
        await queryClient.invalidateQueries({ queryKey: ["itinerary", tripId] });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  // Saving a new place (via AutocompleteSearch's "Save place") both creates the
  // place and adds it to the itinerary in one step — no separate "Add" needed.
  async function saveAndSchedulePlace(place: Place) {
    setSaving(true);
    try {
      await queryClient.invalidateQueries({ queryKey: ["places"] });
      await travelApi.itinerary.schedule(tripId, {
        itemType: "place",
        placeId: place.id,
        legId: legId ? Number(legId) : undefined,
        scheduledDate: scheduledDate || undefined,
        isPrivate,
      });
      await queryClient.invalidateQueries({ queryKey: ["itinerary", tripId] });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const canSave =
    mode === "booking"
      ? bookingForm.title.trim().length > 0
      : mode === "activity"
        ? activityText.trim().length > 0
        : !!placeState?.hasPreview && !!placeState?.canSave;

  function onPrimaryClick() {
    if (mode === "place") {
      placeSearchRef.current?.save();
    } else {
      void save();
    }
  }

  return (
    <Modal onClose={onClose} wide>
      <h2 className="mb-3 text-lg font-semibold text-text-primary">Add to itinerary</h2>
      <div className="mb-3 flex gap-2">
        {(["place", "booking", "activity"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={`rounded-full px-3 py-1 text-sm ${mode === m ? "bg-category-transit text-white" : "bg-surface text-text-secondary"}`}
          >
            {m === "activity" ? "Idea" : m === "place" ? "Place" : "Booking"}
          </button>
        ))}
      </div>

      {mode === "booking" ? (
        <BookingFields form={bookingForm} onChange={setBookingForm} legOptions={legOptions} placeOptions={placeOptions} />
      ) : (
        <IdeaOrPlaceFields
          kind={mode}
          tripId={tripId}
          legOptions={legOptions}
          legId={legId}
          setLegId={setLegId}
          scheduledDate={scheduledDate}
          setScheduledDate={setScheduledDate}
          activityText={activityText}
          setActivityText={setActivityText}
          isPrivate={isPrivate}
          setIsPrivate={setIsPrivate}
          onPlaceCreated={saveAndSchedulePlace}
          placeSearchRef={placeSearchRef}
          onPlaceStateChange={setPlaceState}
        />
      )}

      <div className="mt-3 flex gap-2">
        <button
          onClick={onPrimaryClick}
          disabled={saving || !canSave}
          className="rounded bg-category-transit px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {mode === "place" ? (saving ? "Saving…" : "Save") : "Add"}
        </button>
        <button onClick={onClose} className="text-sm text-text-secondary">
          Cancel
        </button>
      </div>
    </Modal>
  );
}

function EditItemModal({
  tripId,
  entry,
  legOptions,
  placeOptions,
  onClose,
}: {
  tripId: number;
  entry: Entry;
  legOptions: LegOption[];
  placeOptions: { id: number; name: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState(false);

  const [bookingForm, setBookingForm] = useState<BookingFormState>(() => (entry.booking ? bookingToForm(entry.booking) : EMPTY_BOOKING_FORM));
  const [legId, setLegId] = useState(entry.legId != null ? String(entry.legId) : "");
  const [scheduledDate, setScheduledDate] = useState(entry.scheduledDate ?? "");
  const [activityText, setActivityText] = useState(entry.item?.activityText ?? "");
  const [isPrivate, setIsPrivate] = useState(entry.isPrivate);

  async function save() {
    setSaving(true);
    try {
      if (entry.kind === "booking" && entry.booking) {
        await travelApi.bookings.update(tripId, entry.booking.id, bookingFormToBody(bookingForm));
        await queryClient.invalidateQueries({ queryKey: ["bookings", tripId] });
      } else if (entry.item) {
        await travelApi.itinerary.move(tripId, entry.item.id, {
          legId: legId ? Number(legId) : null,
          scheduledDate: scheduledDate || null,
          activityText: entry.kind === "activity" ? activityText.trim() : undefined,
          isPrivate,
        });
        await queryClient.invalidateQueries({ queryKey: ["itinerary", tripId] });
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (entry.kind === "booking" && entry.booking) {
      await travelApi.bookings.remove(tripId, entry.booking.id);
      await queryClient.invalidateQueries({ queryKey: ["bookings", tripId] });
    } else if (entry.item) {
      await travelApi.itinerary.unschedule(tripId, entry.item.id);
      await queryClient.invalidateQueries({ queryKey: ["itinerary", tripId] });
    }
    onClose();
  }

  return (
    <Modal onClose={onClose}>
      <h2 className="mb-3 text-lg font-semibold text-text-primary">
        {entry.kind === "booking" ? "Edit booking" : "Edit idea"}
      </h2>

      {entry.kind === "booking" ? (
        <BookingFields form={bookingForm} onChange={setBookingForm} legOptions={legOptions} placeOptions={placeOptions} />
      ) : (
        <div className="space-y-2">
          <input
            className="w-full rounded border border-gridline bg-transparent p-2 text-text-primary"
            value={activityText}
            onChange={(e) => setActivityText(e.target.value)}
          />
          <div className="flex gap-2">
            <select
              className="flex-1 rounded border border-gridline bg-transparent p-2 text-text-primary"
              value={legId}
              onChange={(e) => setLegId(e.target.value)}
            >
              <option value="">No city</option>
              {legOptions.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.city}
                </option>
              ))}
            </select>
          </div>
          <label className="block text-xs text-text-muted">
            Date (optional)
            <input
              type="date"
              className="w-full rounded border border-gridline bg-transparent p-1 text-text-primary"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </label>
          <label className="flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
            Private
          </label>
        </div>
      )}

      <div className="mt-3 flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={save}
            disabled={saving}
            className="rounded bg-category-transit px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Save
          </button>
          <button onClick={onClose} className="text-sm text-text-secondary">
            Cancel
          </button>
        </div>
        <button onClick={remove} className="text-sm text-status-critical">
          Delete
        </button>
      </div>
    </Modal>
  );
}

// Wanderlog-style inline detail view for a scheduled place — replaces the
// generic edit modal for place-kind entries so the photo/rating/description/
// notes have room to breathe instead of being squeezed into a small dialog.
function PlaceDetailPanel({
  tripId,
  entry,
  place,
  legOptions,
  onClose,
}: {
  tripId: number;
  entry: Entry;
  place: Place | undefined;
  legOptions: LegOption[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [name, setName] = useState(place?.name ?? "");
  const [editingName, setEditingName] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [note, setNote] = useState(place?.note ?? "");
  const [savingNote, setSavingNote] = useState(false);
  // Google's editorialSummary is sparse — only populated for well-known
  // places — so description is editable here too, same autosave-on-blur
  // pattern as notes, letting a blank Google result be filled in by hand.
  const [description, setDescription] = useState(place?.description ?? "");
  const [savingDescription, setSavingDescription] = useState(false);
  const [legId, setLegId] = useState(entry.legId != null ? String(entry.legId) : "");
  const [scheduledDate, setScheduledDate] = useState(entry.scheduledDate ?? "");
  const [isPrivate, setIsPrivate] = useState(entry.isPrivate);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [primaryTag, setPrimaryTagState] = useState<PlaceTag | "">(place?.primaryTag ?? "");
  const [savingPrimaryTag, setSavingPrimaryTag] = useState(false);
  const [photoPicker, setPhotoPicker] = useState<{ loading: boolean; photos: string[] } | null>(null);
  const [selectingPhoto, setSelectingPhoto] = useState(false);
  const [customUrl, setCustomUrl] = useState("");

  async function openPhotoPicker() {
    if (!place) return;
    setCustomUrl("");
    // A manually-added place has no googlePlaceId to pull Google photos from —
    // the picker still opens, just straight to the "paste a URL" option.
    if (!place.googlePlaceId) {
      setPhotoPicker({ loading: false, photos: [] });
      return;
    }
    setPhotoPicker({ loading: true, photos: [] });
    try {
      const { photos } = await travelApi.places.photos(place.id);
      setPhotoPicker({ loading: false, photos });
    } catch {
      setPhotoPicker({ loading: false, photos: [] });
    }
  }

  async function selectPhoto(url: string) {
    if (!place) return;
    setSelectingPhoto(true);
    try {
      await travelApi.places.update(place.id, { heroPhotoUrl: url });
      await queryClient.invalidateQueries({ queryKey: ["places"] });
      setPhotoPicker(null);
    } finally {
      setSelectingPhoto(false);
    }
  }

  async function setPrimaryTag(tag: PlaceTag) {
    if (!place) return;
    setPrimaryTagState(tag);
    setSavingPrimaryTag(true);
    try {
      await travelApi.places.update(place.id, { primaryTag: tag });
      await queryClient.invalidateQueries({ queryKey: ["places"] });
    } finally {
      setSavingPrimaryTag(false);
    }
  }

  async function saveName() {
    setEditingName(false);
    if (!place || !name.trim() || name.trim() === place.name) {
      setName(place?.name ?? "");
      return;
    }
    setSavingName(true);
    try {
      await travelApi.places.update(place.id, { name: name.trim() });
      await queryClient.invalidateQueries({ queryKey: ["places"] });
    } finally {
      setSavingName(false);
    }
  }

  async function saveNote() {
    if (!place || note === (place.note ?? "")) return;
    setSavingNote(true);
    try {
      await travelApi.places.update(place.id, { note: note.trim() });
      await queryClient.invalidateQueries({ queryKey: ["places"] });
    } finally {
      setSavingNote(false);
    }
  }

  async function saveDescription() {
    if (!place || description === (place.description ?? "")) return;
    setSavingDescription(true);
    try {
      await travelApi.places.update(place.id, { description: description.trim() });
      await queryClient.invalidateQueries({ queryKey: ["places"] });
    } finally {
      setSavingDescription(false);
    }
  }

  async function saveSchedule() {
    if (!entry.item) return;
    setSavingSchedule(true);
    try {
      await travelApi.itinerary.move(tripId, entry.item.id, {
        legId: legId ? Number(legId) : null,
        scheduledDate: scheduledDate || null,
        isPrivate,
      });
      await queryClient.invalidateQueries({ queryKey: ["itinerary", tripId] });
    } finally {
      setSavingSchedule(false);
    }
  }

  // Deletes the place outright (cascades to itinerary_items and trip_places
  // via FK, so it disappears from this trip's itinerary, the ideas tray, the
  // Places list, and the map overview in one action) rather than just
  // unscheduling it — places are only ever managed through the itinerary now.
  async function remove() {
    if (!place) return;
    await travelApi.places.remove(place.id);
    await queryClient.invalidateQueries({ queryKey: ["itinerary", tripId] });
    await queryClient.invalidateQueries({ queryKey: ["places"] });
    onClose();
  }

  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    if (!place) return;
    setRefreshing(true);
    try {
      const updated = await travelApi.places.refreshDetails(place.id);
      setDescription(updated.description ?? "");
      await queryClient.invalidateQueries({ queryKey: ["places"] });
    } finally {
      setRefreshing(false);
    }
  }

  if (!place) {
    return (
      <li className="rounded border border-category-transit bg-surface p-3 text-sm text-text-muted">
        Place details unavailable.{" "}
        <button onClick={onClose} className="underline">
          Close
        </button>
      </li>
    );
  }

  return (
    <li className="flex gap-4 overflow-hidden rounded border border-category-transit bg-surface p-4 shadow-sm">
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <div className="flex items-center gap-1">
            {editingName ? (
              <input
                autoFocus
                className="w-full min-w-0 flex-1 rounded border border-gridline bg-transparent p-1 text-lg font-semibold text-text-primary"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={saveName}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") {
                    setName(place.name);
                    setEditingName(false);
                  }
                }}
              />
            ) : (
              <h4
                onClick={onClose}
                title="Click to collapse"
                className="cursor-pointer text-lg font-semibold text-text-primary"
              >
                {place.name}
              </h4>
            )}
            {!editingName && (
              <button
                type="button"
                onClick={() => {
                  setName(place.name);
                  setEditingName(true);
                }}
                title="Edit name"
                className="text-text-muted hover:text-text-primary"
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  edit
                </span>
              </button>
            )}
            {savingName && <span className="text-xs text-text-muted">Saving…</span>}
          </div>
          <button onClick={onClose} className="text-left" title="Click to collapse">
            <p className="text-xs uppercase text-text-muted">
              {primaryTag ? enumLabel(PLACE_TAGS, primaryTag) : "Uncategorized"}
            </p>
            {place.address && <p className="text-sm text-text-secondary">{place.address}</p>}
          </button>
        </div>

        {(place.rating != null || (place.googleTypes && place.googleTypes.length > 0)) && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            {place.rating != null && (
              <span className="font-medium text-text-primary">
                ★ {place.rating.toFixed(1)}
                {place.userRatingsTotal != null && (
                  <span className="font-normal text-text-muted"> ({place.userRatingsTotal.toLocaleString()})</span>
                )}
              </span>
            )}
            {place.googleTypes?.slice(0, 5).map((t) => (
              <span key={t} className="rounded-full bg-page px-2 py-0.5 text-xs text-text-secondary">
                {t.replace(/_/g, " ")}
              </span>
            ))}
          </div>
        )}

        <div>
          <textarea
            className="w-full resize-none rounded border border-transparent bg-transparent p-1 text-sm text-text-secondary hover:border-gridline focus:border-gridline focus:outline-none"
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={saveDescription}
            placeholder="No description available — add your own…"
          />
          {savingDescription && <span className="text-xs text-text-muted">Saving…</span>}
        </div>

        <div className="flex items-center gap-3">
          {place.website && (
            <a
              href={place.website}
              target="_blank"
              rel="noreferrer"
              className="text-sm text-category-transit hover:underline"
            >
              Visit website ↗
            </a>
          )}
          {place.googlePlaceId && (
            <button
              onClick={refresh}
              disabled={refreshing}
              className="text-sm text-text-muted hover:text-text-primary disabled:opacity-50"
            >
              {refreshing ? "Refreshing…" : "Refresh from Google ⟳"}
            </button>
          )}
        </div>

        {place.hours && (
          <details className="text-sm">
            <summary className="cursor-pointer text-text-secondary">Hours</summary>
            <ul className="mt-1 space-y-0.5 text-text-muted">
              {Object.values(place.hours).map((line, i) => (
                <li key={i}>{line}</li>
              ))}
            </ul>
          </details>
        )}

        <div className="border-t border-gridline pt-3">
          <label className="block text-xs font-medium text-text-muted">Primary</label>
          <select
            className="mt-1 w-full rounded border border-gridline bg-transparent p-2 text-sm text-text-primary"
            value={primaryTag}
            onChange={(e) => setPrimaryTag(e.target.value as PlaceTag)}
          >
            <option value="" disabled>
              Choose a primary tag…
            </option>
            {PLACE_TAGS.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
          {savingPrimaryTag && <span className="text-xs text-text-muted">Saving…</span>}
        </div>

        <div className="border-t border-gridline pt-3">
          <label className="block text-xs font-medium text-text-muted">Your notes</label>
          <textarea
            className="mt-1 w-full rounded border border-gridline bg-transparent p-2 text-sm text-text-primary"
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onBlur={saveNote}
            placeholder="Add a note about this place…"
          />
          {savingNote && <span className="text-xs text-text-muted">Saving…</span>}
        </div>

        <div className="border-t border-gridline pt-3">
          <label className="block text-xs font-medium text-text-muted">Scheduling</label>
          <select
            className="mt-1 w-full rounded border border-gridline bg-transparent p-2 text-sm text-text-primary"
            value={legId}
            onChange={(e) => setLegId(e.target.value)}
          >
            <option value="">No city</option>
            {legOptions.map((l) => (
              <option key={l.id} value={l.id}>
                {l.city}
              </option>
            ))}
          </select>
          <div className="mt-2 flex gap-2">
            <input
              type="date"
              className="flex-1 rounded border border-gridline bg-transparent p-2 text-sm text-text-primary"
              value={scheduledDate}
              onChange={(e) => setScheduledDate(e.target.value)}
            />
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
            <input type="checkbox" checked={isPrivate} onChange={(e) => setIsPrivate(e.target.checked)} />
            Private
          </label>
          <div className="mt-2 flex items-center justify-between">
            <button
              onClick={saveSchedule}
              disabled={savingSchedule}
              className="rounded bg-category-transit px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Save
            </button>
            <button onClick={remove} className="text-sm text-status-critical">
              Delete place
            </button>
          </div>
        </div>
      </div>
      {
        // Large, right-aligned frame — object-contain plus a fill behind it
        // means the whole photo stays visible (letterboxed on the short axis)
        // rather than being cropped to fit a fixed box. Always clickable —
        // Google-linked places get a photo picker, manual places (and any
        // photo-less place) can still paste in a URL.
      }
      <button
        type="button"
        onClick={openPhotoPicker}
        title={place.heroPhotoUrl ? "Choose a different photo" : "Add a photo"}
        className="flex h-56 w-56 shrink-0 items-start justify-center self-start overflow-hidden bg-page sm:h-80 sm:w-80"
      >
        {place.heroPhotoUrl ? (
          <img src={place.heroPhotoUrl} alt={place.name} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-center text-sm text-text-muted">
            Add a photo
          </span>
        )}
      </button>

      {photoPicker && (
        <Modal onClose={() => (selectingPhoto ? undefined : setPhotoPicker(null))} wide>
          <h2 className="mb-3 text-lg font-semibold text-text-primary">Choose a photo</h2>
          {photoPicker.loading ? (
            <p className="text-sm text-text-muted">Loading photos…</p>
          ) : (
            <>
              {photoPicker.photos.length > 0 && (
                <div className="grid grid-cols-3 gap-2">
                  {photoPicker.photos.map((url) => (
                    <button
                      key={url}
                      type="button"
                      onClick={() => selectPhoto(url)}
                      disabled={selectingPhoto}
                      className={`aspect-square overflow-hidden rounded bg-page disabled:opacity-50 ${
                        url === place.heroPhotoUrl ? "ring-2 ring-category-transit" : ""
                      }`}
                    >
                      <img src={url} alt="" className="h-full w-full object-cover" />
                    </button>
                  ))}
                </div>
              )}
              <div className="mt-3 border-t border-gridline pt-3">
                <label className="block text-xs font-medium text-text-muted">Or paste an image URL</label>
                <div className="mt-1 flex gap-2">
                  <input
                    className="flex-1 rounded border border-gridline bg-transparent p-2 text-sm text-text-primary"
                    placeholder="https://…"
                    value={customUrl}
                    onChange={(e) => setCustomUrl(e.target.value)}
                  />
                  <button
                    onClick={() => selectPhoto(customUrl.trim())}
                    disabled={selectingPhoto || !customUrl.trim()}
                    className="rounded bg-category-transit px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                  >
                    Use
                  </button>
                </div>
              </div>
            </>
          )}
          <div className="mt-3">
            <button onClick={() => setPhotoPicker(null)} className="text-sm text-text-secondary">
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </li>
  );
}

// Booking's counterpart to PlaceDetailPanel — same shell (title, description,
// photo, scheduling) so a flight/hotel/train row expands into something that
// reads identically to a place, plus a "Details" block for the fields only
// bookings carry (confirmation code, flight number, price). A booking has no
// photo of its own — linking it to a library place (optional, not offered for
// hotels since their own address already fills that role) is how it gets one.
function BookingDetailPanel({
  tripId,
  entry,
  place,
  legOptions,
  placeOptions,
  onClose,
}: {
  tripId: number;
  entry: Entry;
  place: Place | undefined;
  legOptions: LegOption[];
  placeOptions: { id: number; name: string }[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const booking = entry.booking!;
  const bookingType = BOOKING_TYPES.find((t) => t.key === booking.type);

  const [title, setTitle] = useState(booking.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [savingTitle, setSavingTitle] = useState(false);
  const [notes, setNotes] = useState(booking.notes ?? "");
  const [savingNotes, setSavingNotes] = useState(false);
  const [confirmationCode, setConfirmationCode] = useState(booking.confirmationCode ?? "");
  const [savingConfirmation, setSavingConfirmation] = useState(false);
  const [flightNumber, setFlightNumber] = useState(booking.flightNumber ?? "");
  const [savingFlightNumber, setSavingFlightNumber] = useState(false);
  const [price, setPrice] = useState(booking.price != null ? String(booking.price) : "");
  const [currency, setCurrency] = useState(booking.currency ?? "");
  const [savingPrice, setSavingPrice] = useState(false);
  const [placeIdSel, setPlaceIdSel] = useState(booking.placeId != null ? String(booking.placeId) : "");
  const [savingPlace, setSavingPlace] = useState(false);

  const [legId, setLegId] = useState(booking.legId != null ? String(booking.legId) : "");
  const [startDate, setStartDate] = useState(booking.startAt?.slice(0, 10) ?? "");
  const [startTime, setStartTime] = useState(() => {
    const t = booking.startAt?.slice(11, 16) ?? "";
    return t === "00:00" ? "" : t;
  });
  const [endDate, setEndDate] = useState(booking.endAt?.slice(0, 10) ?? "");
  const [endTime, setEndTime] = useState(() => {
    const t = booking.endAt?.slice(11, 16) ?? "";
    return t === "00:00" ? "" : t;
  });
  const [savingSchedule, setSavingSchedule] = useState(false);

  async function patch(body: Parameters<typeof travelApi.bookings.update>[2]) {
    await travelApi.bookings.update(tripId, booking.id, body);
    await queryClient.invalidateQueries({ queryKey: ["bookings", tripId] });
  }

  async function saveTitle() {
    setEditingTitle(false);
    if (!title.trim() || title.trim() === booking.title) {
      setTitle(booking.title);
      return;
    }
    setSavingTitle(true);
    try {
      await patch({ title: title.trim() });
    } finally {
      setSavingTitle(false);
    }
  }

  async function saveNotes() {
    if (notes === (booking.notes ?? "")) return;
    setSavingNotes(true);
    try {
      await patch({ notes: notes.trim() });
    } finally {
      setSavingNotes(false);
    }
  }

  async function saveConfirmation() {
    if (confirmationCode === (booking.confirmationCode ?? "")) return;
    setSavingConfirmation(true);
    try {
      await patch({ confirmationCode: confirmationCode.trim() });
    } finally {
      setSavingConfirmation(false);
    }
  }

  async function saveFlightNumber() {
    if (flightNumber === (booking.flightNumber ?? "")) return;
    setSavingFlightNumber(true);
    try {
      await patch({ flightNumber: flightNumber.trim() });
    } finally {
      setSavingFlightNumber(false);
    }
  }

  async function savePrice() {
    const numericPrice = price ? Number(price) : undefined;
    if (numericPrice === (booking.price ?? undefined) && currency === (booking.currency ?? "")) return;
    setSavingPrice(true);
    try {
      await patch({ price: numericPrice, currency: currency.trim() || undefined });
    } finally {
      setSavingPrice(false);
    }
  }

  async function saveLinkedPlace(value: string) {
    setPlaceIdSel(value);
    setSavingPlace(true);
    try {
      await patch({ placeId: value ? Number(value) : undefined });
    } finally {
      setSavingPlace(false);
    }
  }

  async function saveSchedule() {
    setSavingSchedule(true);
    try {
      await patch({
        legId: legId ? Number(legId) : undefined,
        startAt: startDate ? `${startDate}T${startTime || "00:00"}:00` : undefined,
        endAt: endDate ? `${endDate}T${endTime || "00:00"}:00` : undefined,
      });
    } finally {
      setSavingSchedule(false);
    }
  }

  async function remove() {
    await travelApi.bookings.remove(tripId, booking.id);
    await queryClient.invalidateQueries({ queryKey: ["bookings", tripId] });
    onClose();
  }

  return (
    <li className="flex gap-4 overflow-hidden rounded border border-category-transit bg-surface p-4 shadow-sm">
      <div className="min-w-0 flex-1 space-y-3">
        <div>
          <div className="flex items-center gap-1">
            {editingTitle ? (
              <input
                autoFocus
                className="w-full min-w-0 flex-1 rounded border border-gridline bg-transparent p-1 text-lg font-semibold text-text-primary"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={saveTitle}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") {
                    setTitle(booking.title);
                    setEditingTitle(false);
                  }
                }}
              />
            ) : (
              <h4 onClick={onClose} title="Click to collapse" className="cursor-pointer text-lg font-semibold text-text-primary">
                {booking.title}
              </h4>
            )}
            {!editingTitle && (
              <button
                type="button"
                onClick={() => {
                  setTitle(booking.title);
                  setEditingTitle(true);
                }}
                title="Edit title"
                className="text-text-muted hover:text-text-primary"
              >
                <span className="material-symbols-outlined text-base" aria-hidden="true">
                  edit
                </span>
              </button>
            )}
            {savingTitle && <span className="text-xs text-text-muted">Saving…</span>}
          </div>
          <button onClick={onClose} className="text-left" title="Click to collapse">
            <p className="text-xs uppercase text-text-muted">{bookingType?.label ?? booking.type}</p>
            {(booking.address || place?.address) && (
              <p className="text-sm text-text-secondary">{booking.address || place?.address}</p>
            )}
          </button>
        </div>

        <div>
          <textarea
            className="w-full resize-none rounded border border-transparent bg-transparent p-1 text-sm text-text-secondary hover:border-gridline focus:border-gridline focus:outline-none"
            rows={2}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            onBlur={saveNotes}
            placeholder="Add notes about this booking…"
          />
          {savingNotes && <span className="text-xs text-text-muted">Saving…</span>}
        </div>

        {booking.type !== "hotel" && (
          <div className="border-t border-gridline pt-3">
            <label className="block text-xs font-medium text-text-muted">Linked place</label>
            <select
              className="mt-1 w-full rounded border border-gridline bg-transparent p-2 text-sm text-text-primary"
              value={placeIdSel}
              onChange={(e) => saveLinkedPlace(e.target.value)}
            >
              <option value="">None</option>
              {placeOptions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {savingPlace && <span className="text-xs text-text-muted">Saving…</span>}
          </div>
        )}

        <div className="border-t border-gridline pt-3">
          <label className="block text-xs font-medium text-text-muted">Details</label>
          <div className="mt-1 flex gap-2">
            <label className="flex-1 text-xs text-text-muted">
              Confirmation code
              <input
                className="mt-0.5 w-full rounded border border-gridline bg-transparent p-2 text-sm text-text-primary"
                value={confirmationCode}
                onChange={(e) => setConfirmationCode(e.target.value)}
                onBlur={saveConfirmation}
              />
            </label>
            {booking.type === "flight" && (
              <label className="flex-1 text-xs text-text-muted">
                Flight number
                <input
                  className="mt-0.5 w-full rounded border border-gridline bg-transparent p-2 text-sm text-text-primary"
                  value={flightNumber}
                  onChange={(e) => setFlightNumber(e.target.value)}
                  onBlur={saveFlightNumber}
                />
              </label>
            )}
          </div>
          <div className="mt-2 flex gap-2">
            <label className="flex-1 text-xs text-text-muted">
              Price
              <input
                type="number"
                className="mt-0.5 w-full rounded border border-gridline bg-transparent p-2 text-sm text-text-primary"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                onBlur={savePrice}
              />
            </label>
            <label className="w-24 text-xs text-text-muted">
              Currency
              <input
                className="mt-0.5 w-full rounded border border-gridline bg-transparent p-2 text-sm text-text-primary"
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                onBlur={savePrice}
              />
            </label>
          </div>
          {savingPrice && <span className="text-xs text-text-muted">Saving…</span>}
        </div>

        <div className="border-t border-gridline pt-3">
          <label className="block text-xs font-medium text-text-muted">Scheduling</label>
          <select
            className="mt-1 w-full rounded border border-gridline bg-transparent p-2 text-sm text-text-primary"
            value={legId}
            onChange={(e) => setLegId(e.target.value)}
          >
            <option value="">No city</option>
            {legOptions.map((l) => (
              <option key={l.id} value={l.id}>
                {l.city}
              </option>
            ))}
          </select>
          <div className="mt-2 flex gap-2">
            <input
              type="date"
              className="flex-1 rounded border border-gridline bg-transparent p-2 text-sm text-text-primary"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
            <input
              type="time"
              className="w-28 rounded border border-gridline bg-transparent p-2 text-sm text-text-primary"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
            />
          </div>
          <div className="mt-2 flex gap-2">
            <input
              type="date"
              className="flex-1 rounded border border-gridline bg-transparent p-2 text-sm text-text-primary"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
            <input
              type="time"
              className="w-28 rounded border border-gridline bg-transparent p-2 text-sm text-text-primary"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
            />
          </div>
          <div className="mt-2 flex items-center justify-between">
            <button
              onClick={saveSchedule}
              disabled={savingSchedule}
              className="rounded bg-category-transit px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
            >
              Save
            </button>
            <button onClick={remove} className="text-sm text-status-critical">
              Delete booking
            </button>
          </div>
        </div>
      </div>

      <div className="flex h-56 w-56 shrink-0 items-center justify-center self-start overflow-hidden bg-page sm:h-80 sm:w-80">
        {place?.heroPhotoUrl ? (
          <img src={place.heroPhotoUrl} alt={booking.title} className="max-h-full max-w-full object-contain" />
        ) : (
          <span className="flex h-full w-full items-center justify-center p-4 text-center text-sm text-text-muted">
            {place ? "Linked place has no photo" : "Link a place above to add a photo"}
          </span>
        )}
      </div>
    </li>
  );
}

function LegHeader({
  tripId,
  leg,
  hotelBooking,
  onEditHotel,
}: {
  tripId: number;
  leg: Leg;
  hotelBooking: Booking | undefined;
  onEditHotel: (booking: Booking) => void;
}) {
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [city, setCity] = useState(leg.city);
  const [startDate, setStartDate] = useState(leg.startDate ? toDateOnlyString(leg.startDate) : "");
  const [endDate, setEndDate] = useState(leg.endDate ? toDateOnlyString(leg.endDate) : "");
  const [dayCount, setDayCount] = useState(String(leg.dayCount ?? 1));
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      // Either a real date range, or a relative day count for a dreaming leg —
      // not both. Setting dates here is what later lets the trip auto-promote
      // from `dreaming` to `planned` (computed in packages/core, not stored).
      const dateFields = startDate && endDate ? { startDate, endDate } : { dayCount: Number(dayCount) || 1 };
      const body = { city: city.trim() || leg.city, ...dateFields };
      await travelApi.trips.updateLeg(tripId, leg.id, body);
      await queryClient.invalidateQueries({ queryKey: ["trips", tripId] });
      setEditing(false);
    } finally {
      setSaving(false);
    }
  }

  async function deleteLeg() {
    await travelApi.trips.deleteLeg(tripId, leg.id);
    await queryClient.invalidateQueries({ queryKey: ["trips", tripId] });
  }

  if (editing) {
    return (
      <div className="mb-3 space-y-2 rounded border border-category-transit p-2">
        <input
          className="w-full rounded border border-gridline bg-transparent p-1 font-medium text-text-primary"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
        <div className="flex gap-2">
          <label className="flex-1 text-xs text-text-muted">
            Start date
            <input
              type="date"
              className="w-full rounded border border-gridline bg-transparent p-1 text-text-primary"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </label>
          <label className="flex-1 text-xs text-text-muted">
            End date
            <input
              type="date"
              className="w-full rounded border border-gridline bg-transparent p-1 text-text-primary"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </label>
        </div>
        <label className="block text-xs text-text-muted">
          Or, if you don&apos;t know dates yet — number of days
          <input
            type="number"
            min={1}
            className="w-full rounded border border-gridline bg-transparent p-1 text-text-primary"
            value={dayCount}
            onChange={(e) => setDayCount(e.target.value)}
          />
        </label>
        <div className="flex items-center justify-between gap-2">
          <div className="flex gap-2">
            <button
              onClick={save}
              disabled={saving}
              className="rounded bg-category-transit px-3 py-1 text-sm font-medium text-white disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => {
                setCity(leg.city);
                setEditing(false);
              }}
              className="text-sm text-text-secondary"
            >
              Cancel
            </button>
          </div>
          <button onClick={deleteLeg} className="text-sm text-status-critical">
            Delete
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-3">
      <h3
        className="inline-block w-fit cursor-pointer text-xl font-bold text-text-primary hover:text-category-transit"
        onClick={() => setEditing(true)}
      >
        {leg.city}
      </h3>
      <div className="text-sm text-text-secondary">
        {leg.startDate && leg.endDate ? formatDateRange(leg.startDate, leg.endDate) : `${leg.dayCount ?? 1} day(s)`}
      </div>
      <div className="flex items-center gap-1 text-sm text-text-muted">
        {hotelBooking ? (
          <button
            onClick={() => onEditHotel(hotelBooking)}
            className="flex items-center gap-1 underline decoration-dotted hover:text-category-transit"
          >
            <span className="material-symbols-outlined text-sm" aria-hidden="true">
              bed
            </span>
            Staying at {hotelBooking.title}
          </button>
        ) : (
          "No lodging set"
        )}
      </div>
    </div>
  );
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
  const placeOptions = (tripPlaces ?? []).map((p) => ({ id: p.id, name: p.name }));

  const hotelBookingByLegId = new Map<number, Booking>();
  // A flight/train/car booking assigned to a leg is treated as the transport
  // that carried the traveler INTO that leg — rendered as a divider between
  // the previous leg and this one instead of as a regular list entry.
  const transportBookingByLegId = new Map<number, Booking>();
  const TRANSPORT_TYPES = new Set(["flight", "train", "car"]);
  for (const b of bookings ?? []) {
    if (b.type === "hotel" && b.legId != null && !hotelBookingByLegId.has(b.legId)) hotelBookingByLegId.set(b.legId, b);
    if (TRANSPORT_TYPES.has(b.type) && b.legId != null && !transportBookingByLegId.has(b.legId)) transportBookingByLegId.set(b.legId, b);
  }

  // Marking complete backfills scheduledDate with today's local date only if
  // it wasn't already set — no time is tracked, per spec. When checking (not
  // unchecking), the fade plays in place for FADE_MS before the list actually
  // reorders the entry to the bottom.
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
              ...(completed && !entry.scheduledDate ? { scheduledDate: todayDateString() } : {}),
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
    // Likewise, a leg's inbound transport booking is surfaced as the divider
    // above that leg's section instead.
    if (entry.kind === "booking" && entry.legId != null && transportBookingByLegId.get(entry.legId)?.id === entry.booking?.id) continue;
    const key = groupFor(entry, sortedLegs, earliestStart, latestEnd);
    groups.set(key, [...(groups.get(key) ?? []), entry]);
  }

  const preEntries = sortEntries(groups.get("pre") ?? []);
  const postEntries = sortEntries(groups.get("post") ?? []);
  const unscheduledEntries = sortEntries(groups.get("unscheduled") ?? []);

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

  return (
    <div className="space-y-4">
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

      {sortedLegs.map((leg, legIndex) => {
        const legKey = `leg-${leg.id}`;
        const expanded = !collapsedSections.has(legKey);
        const rawLegEntries = sortEntries(groups.get(legKey) ?? []);
        const totalCount = rawLegEntries.length;
        const visitedCount = rawLegEntries.filter((e) => e.completed).length;
        const categoryGroups = groupByCategory(rawLegEntries);
        const prevLeg = legIndex > 0 ? sortedLegs[legIndex - 1] : null;
        const transportBooking = transportBookingByLegId.get(leg.id);
        return (
          <div key={leg.id} className="space-y-2">
            {prevLeg && transportBooking && (
              <TransportDivider booking={transportBooking} fromCity={prevLeg.city} toCity={leg.city} />
            )}
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
              {expanded && rawLegEntries.length > 0 && (
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
