"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Trip } from "@travel/types";
import type { ListImageOption } from "@travel/api-client";
import { travelApi } from "@/lib/api";
import { Modal } from "./[id]/trip-itinerary";

function formatDateRange(start: string, end: string): string {
  const fmt = (d: string) =>
    new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
  return `${fmt(start)} – ${fmt(end)}`;
}

function earliestStart(trip: Trip): string | null {
  const dated = trip.legs.filter((l) => l.startDate);
  if (dated.length === 0) return null;
  return dated.reduce((min, l) => (l.startDate! < min ? l.startDate! : min), dated[0].startDate!);
}

function latestEnd(trip: Trip): string | null {
  const dated = trip.legs.filter((l) => l.endDate);
  if (dated.length === 0) return null;
  return dated.reduce((max, l) => (l.endDate! > max ? l.endDate! : max), dated[0].endDate!);
}

function dateLabel(trip: Trip): string {
  const start = earliestStart(trip);
  const end = latestEnd(trip);
  if (start && end) return formatDateRange(start, end);
  if (trip.legs.length === 0) return "No cities yet";
  return "Dates not set";
}

// Primary trip always first. After that: future/current trips ordered by how
// soon they start (soonest next), then past trips ordered by how recently
// they ended (most recent past next, oldest trip last).
function sortTrips(trips: Trip[]): Trip[] {
  const primary = trips.filter((t) => t.isPrimary);
  const rest = trips.filter((t) => !t.isPrimary);
  const upcoming = rest.filter((t) => t.status !== "past");
  const past = rest.filter((t) => t.status === "past");

  upcoming.sort((a, b) => {
    const ad = earliestStart(a);
    const bd = earliestStart(b);
    if (ad && bd) return ad.localeCompare(bd);
    if (ad) return -1;
    if (bd) return 1;
    return a.name.localeCompare(b.name);
  });
  past.sort((a, b) => {
    const ad = latestEnd(a);
    const bd = latestEnd(b);
    if (ad && bd) return bd.localeCompare(ad);
    if (ad) return -1;
    if (bd) return 1;
    return a.name.localeCompare(b.name);
  });

  return [...primary, ...upcoming, ...past];
}

function ChangePhotoModal({ trip, onClose }: { trip: Trip; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [url, setUrl] = useState(trip.listImageUrl ?? "");
  const [saving, setSaving] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [options, setOptions] = useState<{ loading: boolean; items: ListImageOption[] } | null>(null);

  async function saveUrl() {
    if (!url.trim()) return;
    setSaving(true);
    try {
      await travelApi.trips.update(trip.id, {
        listImageUrl: url.trim(),
        listImagePhotographerName: null,
        listImagePhotographerUrl: null,
      });
      await queryClient.invalidateQueries({ queryKey: ["trips"] });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function browseUnsplash() {
    setOptions({ loading: true, items: [] });
    try {
      const { options: items } = await travelApi.trips.listImageOptions(trip.id);
      setOptions({ loading: false, items });
    } catch {
      setOptions({ loading: false, items: [] });
    }
  }

  async function selectOption(option: ListImageOption) {
    setSelecting(true);
    try {
      await travelApi.trips.selectListImage(trip.id, option);
      await queryClient.invalidateQueries({ queryKey: ["trips"] });
      onClose();
    } finally {
      setSelecting(false);
    }
  }

  return (
    <Modal onClose={onClose} wide>
      <h2 className="mb-3 text-lg font-semibold text-text-primary">Change photo — {trip.name}</h2>
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            className="flex-1 rounded border border-gridline bg-transparent p-2 text-text-primary"
            placeholder="Image URL"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <button
            onClick={saveUrl}
            disabled={saving || !url.trim()}
            className="rounded bg-category-transit px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            Save
          </button>
        </div>

        {trip.legs.length > 0 && !options && (
          <button onClick={browseUnsplash} className="text-sm text-text-secondary">
            Browse Unsplash photos…
          </button>
        )}

        {options && (
          <div>
            {options.loading ? (
              <p className="text-sm text-text-muted">Loading photos…</p>
            ) : options.items.length === 0 ? (
              <p className="text-sm text-text-muted">No photos found.</p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {options.items.map((option) => (
                  <button
                    key={option.url}
                    type="button"
                    onClick={() => selectOption(option)}
                    disabled={selecting}
                    className="aspect-square overflow-hidden rounded bg-page disabled:opacity-50"
                    title={`Photo by ${option.photographerName} / Unsplash`}
                  >
                    <img src={option.url} alt="" className="h-full w-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        <div>
          <button onClick={onClose} className="text-sm text-text-secondary">
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  );
}

function TripCard({ trip }: { trip: Trip }) {
  const queryClient = useQueryClient();
  const [changingPhoto, setChangingPhoto] = useState(false);
  const autoFetched = useRef(false);
  const hasCity = trip.legs.length > 0;

  // Auto-fills the card's photo the first time it's seen (fixed from then
  // on) — distinct from the detail page's hero, which re-rolls every visit.
  useEffect(() => {
    if (trip.listImageUrl || !hasCity || autoFetched.current) return;
    autoFetched.current = true;
    travelApi.trips
      .listImage(trip.id)
      .then(() => queryClient.invalidateQueries({ queryKey: ["trips"] }))
      .catch(() => {});
  }, [trip.id, trip.listImageUrl, hasCity, queryClient]);

  return (
    <li className="group relative aspect-[3/2] overflow-hidden border border-gridline bg-surface">
      <Link href={`/trips/${trip.id}`} className="absolute inset-0">
        {trip.listImageUrl ? (
          <img src={trip.listImageUrl} alt={trip.name} className="h-full w-full object-cover" />
        ) : (
          <div className="h-full w-full bg-gradient-to-br from-category-transit via-category-lodging to-category-sight opacity-80" />
        )}
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-end p-3">
          <div className="flex items-center gap-1 text-xl font-semibold text-white">
            {trip.isPrimary && <span title="Home trip">★</span>}
            <span className="truncate">{trip.name}</span>
          </div>
          <div className="text-base text-white/80">{dateLabel(trip)}</div>
        </div>
      </Link>

      <button
        onClick={(e) => {
          e.preventDefault();
          setChangingPhoto(true);
        }}
        className="absolute top-2 right-2 rounded bg-black/40 px-2 py-1 text-xs text-white/80 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
      >
        Change photo
      </button>

      {trip.listImagePhotographerName && trip.listImagePhotographerUrl && (
        // Unsplash API Guidelines require crediting the photographer with a
        // link back whenever one of their photos is displayed.
        <a
          href={`${trip.listImagePhotographerUrl}?utm_source=travel&utm_medium=referral`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="absolute bottom-2 right-2 rounded bg-black/40 px-1.5 py-0.5 text-[10px] text-white/70 opacity-0 transition-opacity hover:text-white group-hover:opacity-100"
        >
          {trip.listImagePhotographerName} / Unsplash
        </a>
      )}

      {changingPhoto && <ChangePhotoModal trip={trip} onClose={() => setChangingPhoto(false)} />}
    </li>
  );
}

export function TripsList() {
  const queryClient = useQueryClient();
  const { data: trips } = useQuery(travelApi.queries.tripsQuery());
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  async function createTrip(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      // A trip needs only a name — dates/legs are entirely optional at creation
      // (a "dreaming" trip, per the spec's grill-session decision).
      await travelApi.trips.create({ name: name.trim() });
      await queryClient.invalidateQueries({ queryKey: ["trips"] });
      setName("");
    } finally {
      setCreating(false);
    }
  }

  const sorted = sortTrips(trips ?? []);

  return (
    <div className="space-y-8">
      <form onSubmit={createTrip} className="flex gap-2">
        <input
          className="flex-1 rounded border border-gridline bg-transparent p-2 text-text-primary"
          placeholder="New trip name…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <button
          type="submit"
          disabled={creating}
          className="rounded bg-category-transit px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          Create
        </button>
      </form>

      {sorted.length > 0 ? (
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {sorted.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </ul>
      ) : (
        <p className="text-text-muted">No trips yet — create one above.</p>
      )}
    </div>
  );
}
