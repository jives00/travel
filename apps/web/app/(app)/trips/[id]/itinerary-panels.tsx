"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { Booking, Leg, Place, PlaceTag } from "@travel/types";
import { BOOKING_TYPES, PLACE_TAGS, enumLabel, placeMapsUrl, bookingMapsUrl } from "@travel/core";
import { travelApi } from "@/lib/api";
import {
  BookingFields,
  type BookingFormState,
  EMPTY_FORM as EMPTY_BOOKING_FORM,
  formToBody as bookingFormToBody,
  formToUpdateBody as bookingFormToUpdateBody,
  bookingToForm,
} from "@/components/booking-fields";
import {
  AutocompleteSearch,
  type AutocompleteSearchHandle,
  type AutocompleteSearchState,
} from "@/components/autocomplete-search";
import { type Entry, type LegOption, formatDateRange, formatTime12h, toDateOnlyString } from "./itinerary-entry";

// Every shared piece of itinerary UI — the modal shell, the entry row, the
// add/edit dialogs, and the inline place/booking detail panels — so the list
// view and the calendar view render an entry identically.

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

export function EntryRow({
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

export function IdeaOrPlaceFields({
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

export function AddItemModal({
  tripId,
  legOptions,
  placeOptions,
  defaultLegId,
  defaultDate,
  dayLabel,
  unscheduledEntries,
  onClose,
}: {
  tripId: number;
  legOptions: LegOption[];
  placeOptions: { id: number; name: string }[];
  defaultLegId?: number;
  /** Pre-fills the date when opened from a specific calendar day. */
  defaultDate?: string;
  /** Human-readable form of `defaultDate`, for the dialog title. */
  dayLabel?: string;
  /** Places/ideas that have no date yet — offered as an "Existing" tab so a
   * day can be filled from what's already saved, not just from new items. */
  unscheduledEntries?: Entry[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  // Opened from a calendar day with unscheduled entries waiting, the common
  // intent is "put one of those here", not "create something new" — so start on
  // Existing whenever that tab is offered at all (same condition that renders
  // its chip below).
  const [mode, setMode] = useState<"booking" | "activity" | "place" | "existing">(
    defaultDate && (unscheduledEntries?.length ?? 0) > 0 ? "existing" : "place",
  );
  const [saving, setSaving] = useState(false);

  const defaultLegIdStr = defaultLegId != null ? String(defaultLegId) : "";
  const [bookingForm, setBookingForm] = useState<BookingFormState>(() => ({
    ...EMPTY_BOOKING_FORM,
    legId: defaultLegIdStr,
    startDate: defaultDate ?? "",
  }));
  const [legId, setLegId] = useState(defaultLegIdStr);
  const [scheduledDate, setScheduledDate] = useState(defaultDate ?? "");
  const [activityText, setActivityText] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const placeSearchRef = useRef<AutocompleteSearchHandle>(null);
  const [placeState, setPlaceState] = useState<AutocompleteSearchState | null>(null);

  async function save() {
    setSaving(true);
    try {
      // "existing" never reaches here — it schedules through scheduleExisting.
      if (mode === "existing") return;
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

  // Linking something already saved onto this day: a date (and the day's city,
  // if it has one) is all that changes — booking entries move via their own
  // startAt, itinerary items via scheduledDate.
  async function scheduleExisting(entry: Entry) {
    if (!defaultDate) return;
    setSaving(true);
    try {
      if (entry.kind === "booking" && entry.booking) {
        await travelApi.bookings.update(tripId, entry.booking.id, {
          startAt: `${defaultDate}T00:00:00`,
          ...(defaultLegId != null ? { legId: defaultLegId } : {}),
        });
        await queryClient.invalidateQueries({ queryKey: ["bookings", tripId] });
      } else if (entry.item) {
        await travelApi.itinerary.move(tripId, entry.item.id, {
          scheduledDate: defaultDate,
          ...(defaultLegId != null ? { legId: defaultLegId } : {}),
        });
        await queryClient.invalidateQueries({ queryKey: ["itinerary", tripId] });
      }
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
        : mode === "existing"
          ? false
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
      <h2 className="mb-3 text-lg font-semibold text-text-primary">
        {dayLabel ? `Add to ${dayLabel}` : "Add to itinerary"}
      </h2>
      <div className="mb-3 flex flex-wrap gap-2">
        {(["place", "booking", "activity", "existing"] as const)
          // "Existing" only makes sense when opened on a specific day and
          // there's actually something undated to pull in.
          .filter((m) => m !== "existing" || (defaultDate && (unscheduledEntries?.length ?? 0) > 0))
          .map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-full px-3 py-1 text-sm ${mode === m ? "bg-category-transit text-white" : "bg-surface text-text-secondary"}`}
            >
              {m === "activity" ? "Idea" : m === "place" ? "Place" : m === "booking" ? "Booking" : "Existing"}
            </button>
          ))}
      </div>

      {mode === "existing" ? (
        <ul className="max-h-80 space-y-1 overflow-y-auto">
          {(unscheduledEntries ?? []).map((entry) => (
            <li key={entry.key}>
              <button
                onClick={() => scheduleExisting(entry)}
                disabled={saving}
                className="flex w-full items-center gap-2 rounded border border-gridline bg-surface p-2 text-left text-sm hover:border-category-transit disabled:opacity-50"
              >
                {entry.icon && (
                  <span className="material-symbols-outlined text-base text-text-muted" aria-hidden="true">
                    {entry.icon}
                  </span>
                )}
                <span className="min-w-0 flex-1 truncate text-text-primary">{entry.title}</span>
                <span className="shrink-0 text-xs text-text-muted">{entry.categoryLabel}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : mode === "booking" ? (
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
        {mode !== "existing" && (
          <button
            onClick={onPrimaryClick}
            disabled={saving || !canSave}
            className="rounded bg-category-transit px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {mode === "place" ? (saving ? "Saving…" : "Save") : "Add"}
          </button>
        )}
        <button onClick={onClose} className="text-sm text-text-secondary">
          Cancel
        </button>
      </div>
    </Modal>
  );
}

export function EditItemModal({
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
        await travelApi.bookings.update(tripId, entry.booking.id, bookingFormToUpdateBody(bookingForm));
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
export function PlaceDetailPanel({
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
          <a
            href={placeMapsUrl(place)}
            target="_blank"
            rel="noreferrer"
            className="text-sm text-category-transit hover:underline"
          >
            Open in Google Maps ↗
          </a>
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
export function BookingDetailPanel({
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

  const mapsUrl = bookingMapsUrl(booking, place);

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

  // Every caller below clears with `null`, never `undefined`: an `undefined`
  // value is dropped by JSON.stringify, so the field would either silently keep
  // its old value or — if it was the only field in the patch — produce an empty
  // body the route rejects outright. See UpdateBookingBody in @travel/types.
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
      await patch({ notes: notes.trim() || null });
    } finally {
      setSavingNotes(false);
    }
  }

  async function saveConfirmation() {
    if (confirmationCode === (booking.confirmationCode ?? "")) return;
    setSavingConfirmation(true);
    try {
      await patch({ confirmationCode: confirmationCode.trim() || null });
    } finally {
      setSavingConfirmation(false);
    }
  }

  async function saveFlightNumber() {
    if (flightNumber === (booking.flightNumber ?? "")) return;
    setSavingFlightNumber(true);
    try {
      await patch({ flightNumber: flightNumber.trim() || null });
    } finally {
      setSavingFlightNumber(false);
    }
  }

  async function savePrice() {
    const numericPrice = price ? Number(price) : null;
    if (numericPrice === booking.price && currency === (booking.currency ?? "")) return;
    setSavingPrice(true);
    try {
      await patch({ price: numericPrice, currency: currency.trim() || null });
    } finally {
      setSavingPrice(false);
    }
  }

  async function saveLinkedPlace(value: string) {
    setPlaceIdSel(value);
    setSavingPlace(true);
    try {
      await patch({ placeId: value ? Number(value) : null });
    } finally {
      setSavingPlace(false);
    }
  }

  async function saveSchedule() {
    setSavingSchedule(true);
    try {
      await patch({
        legId: legId ? Number(legId) : null,
        startAt: startDate ? `${startDate}T${startTime || "00:00"}:00` : null,
        endAt: endDate ? `${endDate}T${endTime || "00:00"}:00` : null,
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
          {/* Null for a booking with neither its own coordinates nor a linked
              place — a flight with no address has nothing to point at. */}
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-sm text-category-transit hover:underline"
            >
              Open in Google Maps ↗
            </a>
          )}
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

export function LegHeader({
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
