"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { Booking, Leg, Trip } from "@travel/types";
import { travelApi } from "@/lib/api";
import { Modal, TripItinerary } from "./trip-itinerary";
import { TripWeather } from "./trip-weather";
import { TripMap } from "./trip-map";

// `d` may arrive as a plain "YYYY-MM-DD" or a full ISO datetime (MySQL DATE
// columns come back as JS Date objects and serialize as "2026-09-01T00:00:00.000Z")
// — normalize to the date portion before reparsing, or a double time suffix
// produces an invalid Date.
function toDateOnlyString(d: string): string {
  return d.length > 10 ? d.slice(0, 10) : d;
}

function dateOnly(d: string): Date {
  return new Date(`${toDateOnlyString(d)}T00:00:00Z`);
}

function formatDate(d: string): string {
  return dateOnly(d).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function formatDateRange(start: string, end: string): string {
  return `${formatDate(start)} – ${formatDate(end)}`;
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

interface Countdown {
  headline: string;
  subline: string;
}

// "Leg" is the internal/data-model term (matches the API and packages/types);
// the UI calls it "city" throughout, per the user's rename request.
function pluralCity(n: number): string {
  return n === 1 ? "city" : "cities";
}

// The overall trip span — earliest date across dated cities *and* bookings
// (so a pre-trip flight the day before the first city, or a post-trip flight
// after the last, extends the range) through the latest such date, inclusive.
// Used both for the hero countdown and the at-a-glance "Total days" stat, so
// the two numbers never disagree. Returns null for a dreaming trip (no leg
// has real dates yet) — that gate stays leg-based, matching how trip.status
// itself is computed, even though the range widening also considers bookings.
function tripDateSpan(trip: Trip, bookings: Booking[]): { earliest: string; latest: string; totalDays: number } | null {
  const datedLegs = trip.legs.filter((l) => l.startDate && l.endDate);
  if (datedLegs.length === 0) return null;
  const legDates = datedLegs.flatMap((l) => [toDateOnlyString(l.startDate!), toDateOnlyString(l.endDate!)]);
  const bookingDates = bookings
    .flatMap((b) => [b.startAt, b.endAt])
    .filter((d): d is string => !!d)
    .map(toDateOnlyString);
  const allDates = [...legDates, ...bookingDates];
  const earliest = allDates.reduce((min, d) => (d < min ? d : min), allDates[0]);
  const latest = allDates.reduce((max, d) => (d > max ? d : max), allDates[0]);
  return { earliest, latest, totalDays: daysBetween(dateOnly(earliest), dateOnly(latest)) + 1 };
}

// Driven entirely by the actual dates vs. today — not by trip.status. A
// manual status override (e.g. pinning "active" early) still affects grouping
// and nudges elsewhere, but the countdown must stay numerically sensible
// regardless: a trip whose cities start in the future always gets a "days to
// go" countdown, never a broken "Day -53 of N".
function computeCountdown(trip: Trip, sortedLegs: Leg[], bookings: Booking[], today: Date): Countdown {
  const span = tripDateSpan(trip, bookings);

  if (!span) {
    const totalDays = sortedLegs.reduce((sum, l) => sum + (l.dayCount ?? 1), 0);
    return {
      headline: "Still dreaming",
      subline: `${totalDays} day(s) planned across ${sortedLegs.length} ${pluralCity(sortedLegs.length)} — no dates yet`,
    };
  }

  const { earliest, latest, totalDays: total } = span;
  const range = formatDateRange(earliest, latest);
  const start = dateOnly(earliest);
  const end = dateOnly(latest);

  if (today < start) {
    const n = daysBetween(today, start);
    const headline = n === 0 ? "Starts today!" : n === 1 ? "1 day to go" : `${n} days to go`;
    return { headline, subline: range };
  }
  if (today > end) {
    return { headline: "Trip completed", subline: range };
  }
  const day = daysBetween(start, today) + 1;
  return { headline: `Day ${day} of ${total}`, subline: range };
}

function HeroImage({
  tripId,
  name,
  heroImageUrl,
  onChangeBackdrop,
  editButton,
}: {
  tripId: number;
  name: string;
  heroImageUrl: string | null;
  onChangeBackdrop: () => void;
  editButton: React.ReactNode;
}) {
  // A user-set backdrop is fixed — skip the Unsplash fetch entirely (via
  // `enabled`, not a conditional hook call) rather than pay for a lookup
  // whose result is about to be ignored.
  const { data: hero } = useQuery({
    ...travelApi.queries.heroImageQuery(tripId),
    enabled: !heroImageUrl,
  });

  // Edit + Change backdrop share one row in the top-right corner — the title
  // occupies top-left and the countdown occupies the bottom, so top-right is
  // the only free spot for these small utility controls.
  const topRightRow = (
    <div className="flex items-center gap-2">
      {editButton}
      <button
        onClick={onChangeBackdrop}
        className="rounded bg-black/40 px-2 py-1 text-xs text-white/80 hover:text-white"
      >
        Change backdrop
      </button>
    </div>
  );

  if (heroImageUrl) {
    // Arbitrary user-supplied URL/host — deliberately a plain <img>, not
    // next/image, so this doesn't need next.config.mjs's remotePatterns
    // widened to allow any domain.
    return (
      <>
        <img src={heroImageUrl} alt={name} className="h-full w-full object-cover" />
        <div className="absolute top-2 right-2">{topRightRow}</div>
      </>
    );
  }

  if (hero?.url) {
    return (
      <>
        <Image src={hero.url} alt={hero.city ?? name} fill priority sizes="100vw" className="object-cover" />
        <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
          {topRightRow}
          {hero.photographerName && hero.photographerUrl && (
            // Unsplash API Guidelines require crediting the photographer with a
            // link back whenever a photo from their API is displayed.
            <a
              href={`${hero.photographerUrl}?utm_source=travel&utm_medium=referral`}
              target="_blank"
              rel="noreferrer"
              className="rounded bg-black/40 px-2 py-1 text-xs text-white/80 hover:text-white"
            >
              Photo: {hero.photographerName} / Unsplash
            </a>
          )}
        </div>
      </>
    );
  }
  return (
    <div className="relative h-full w-full bg-gradient-to-br from-category-transit via-category-lodging to-category-sight opacity-80">
      <div className="absolute top-2 right-2">{topRightRow}</div>
    </div>
  );
}

export function TripDetail({ tripId }: { tripId: number }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: trip } = useQuery(travelApi.queries.tripQuery(tripId));
  const { data: tripPlaces } = useQuery(travelApi.queries.placesQuery({ tripId }));
  const { data: bookings } = useQuery(travelApi.queries.bookingsQuery(tripId));
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [archiving, setArchiving] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [togglingPrimary, setTogglingPrimary] = useState(false);
  const [editingBackdrop, setEditingBackdrop] = useState(false);
  const [backdropUrl, setBackdropUrl] = useState("");
  const [savingBackdrop, setSavingBackdrop] = useState(false);
  const [editingTrip, setEditingTrip] = useState(false);
  const [hoveredPlaceId, setHoveredPlaceId] = useState<number | null>(null);
  const [activeLegId, setActiveLegId] = useState<number | null>(null);

  async function saveName() {
    if (!name.trim()) return setEditingName(false);
    await travelApi.trips.update(tripId, { name: name.trim() });
    await queryClient.invalidateQueries({ queryKey: ["trips", tripId] });
    setEditingName(false);
  }

  async function saveBackdrop() {
    if (!backdropUrl.trim()) return;
    setSavingBackdrop(true);
    try {
      await travelApi.trips.update(tripId, { heroImageUrl: backdropUrl.trim() });
      await queryClient.invalidateQueries({ queryKey: ["trips", tripId] });
      setEditingBackdrop(false);
    } finally {
      setSavingBackdrop(false);
    }
  }

  async function useUnsplashBackdrop() {
    setSavingBackdrop(true);
    try {
      await travelApi.trips.update(tripId, { heroImageUrl: null });
      await queryClient.invalidateQueries({ queryKey: ["trips", tripId] });
      setEditingBackdrop(false);
    } finally {
      setSavingBackdrop(false);
    }
  }

  async function archiveTrip() {
    setArchiving(true);
    try {
      await travelApi.trips.archive(tripId);
      await queryClient.invalidateQueries({ queryKey: ["trips"] });
      router.push("/trips");
    } finally {
      setArchiving(false);
    }
  }

  async function setStatusOverride(value: string) {
    setSavingStatus(true);
    try {
      await travelApi.trips.update(tripId, { statusOverride: (value || null) as Trip["statusOverride"] });
      await queryClient.invalidateQueries({ queryKey: ["trips", tripId] });
    } finally {
      setSavingStatus(false);
    }
  }

  async function togglePrimary() {
    if (!trip) return;
    setTogglingPrimary(true);
    try {
      if (trip.isPrimary) await travelApi.trips.clearPrimary(tripId);
      else await travelApi.trips.setPrimary(tripId);
      await queryClient.invalidateQueries({ queryKey: ["trips"] });
    } finally {
      setTogglingPrimary(false);
    }
  }

  if (!trip) return null;

  const sortedLegs = [...trip.legs].sort((a, b) => a.sortOrder - b.sortOrder);

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  const countdown = computeCountdown(trip, sortedLegs, bookings ?? [], today);
  const cityChain = sortedLegs.map((l) => l.city).join(" → ");
  const hotelBookingByLegId = new Map<number, Booking>();
  for (const b of bookings ?? []) {
    if (b.type === "hotel" && b.legId != null && !hotelBookingByLegId.has(b.legId)) hotelBookingByLegId.set(b.legId, b);
  }

  const legsWithoutDates = sortedLegs.filter((l) => !l.startDate || !l.endDate);
  const legsWithoutLodging = sortedLegs.filter((l) => !hotelBookingByLegId.has(l.id));
  const ideaCount = (tripPlaces ?? []).filter((p) => p.status === "idea").length;
  const nudges: { text: string; tone: "warning" | "info" }[] = [];
  if (trip.status !== "dreaming" && legsWithoutDates.length > 0) {
    nudges.push({
      text: `${legsWithoutDates.length} ${pluralCity(legsWithoutDates.length)} still need dates`,
      tone: "warning",
    });
  }
  if (sortedLegs.length > 0 && legsWithoutLodging.length > 0) {
    nudges.push({
      text: `${legsWithoutLodging.length} ${pluralCity(legsWithoutLodging.length)} have no lodging set`,
      tone: "warning",
    });
  }
  if (ideaCount > 0) {
    nudges.push({ text: `${ideaCount} idea(s) not yet scheduled onto a day`, tone: "info" });
  }

  return (
    <div className="space-y-6">
      {/* Hero — name/countdown/status overlaid on the image again, so a dark
          scrim is back specifically for text legibility (independent of the
          page-blend fade that was removed) — white text always sits on this
          gradient regardless of image content or theme. */}
      <div className="relative -mx-6 -mt-6 h-64 overflow-hidden sm:h-72 md:h-80">
        <HeroImage
          tripId={tripId}
          name={trip.name}
          heroImageUrl={trip.heroImageUrl}
          onChangeBackdrop={() => {
            setBackdropUrl(trip.heroImageUrl ?? "");
            setEditingBackdrop(true);
          }}
          editButton={
            <button
              onClick={() => setEditingTrip(true)}
              className="rounded bg-black/40 px-2 py-1 text-xs text-white/80 hover:text-white"
            >
              Edit
            </button>
          }
        />
        {/* Narrow left-side darkening just for the overlaid text's contrast —
            fades out well before the right-hand Edit/Change-backdrop area, so
            most of the image stays untouched. */}
        <div className="pointer-events-none absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-black/60 to-transparent" />
        {/* pointer-events-none so this full-cover overlay doesn't block clicks
            on HeroImage's Edit/Change-backdrop buttons underneath it (they're
            earlier in the DOM, so this later sibling paints on top) — restored
            to auto only on the actual interactive pieces below. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col justify-between p-4 md:p-6">
          <div>
            {editingName ? (
              <div className="pointer-events-auto flex gap-2">
                <input
                  autoFocus
                  className="rounded border border-white/40 bg-black/40 p-1 text-3xl font-bold text-white"
                  defaultValue={trip.name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveName()}
                />
                <button onClick={saveName} className="text-sm font-medium text-white underline">
                  Save
                </button>
              </div>
            ) : (
              <h1
                className="pointer-events-auto inline-block w-fit cursor-pointer text-3xl font-bold text-white drop-shadow md:text-4xl"
                onClick={() => {
                  setName(trip.name);
                  setEditingName(true);
                }}
              >
                {trip.name}
              </h1>
            )}
            {cityChain && <p className="text-sm text-white/80 md:text-base">{cityChain}</p>}
          </div>
          <div>
            <div className="text-3xl font-bold text-white md:text-4xl">{countdown.headline}</div>
            <div className="mt-1 text-sm text-white/80">{countdown.subline}</div>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          href={`/trips/${tripId}/budget`}
          className="inline-flex items-center gap-1 rounded border border-gridline bg-surface px-3 py-1.5 text-sm font-medium text-text-primary hover:border-category-transit"
        >
          <span className="material-symbols-outlined text-base" aria-hidden="true">
            payments
          </span>
          Budget
        </Link>
      </div>

      {editingBackdrop && (
        <div className="flex flex-wrap items-center gap-2 rounded border border-gridline bg-surface p-3 text-sm">
          <input
            autoFocus
            className="min-w-[16rem] flex-1 rounded border border-gridline bg-transparent p-2 text-text-primary"
            placeholder="Image URL"
            value={backdropUrl}
            onChange={(e) => setBackdropUrl(e.target.value)}
          />
          <button
            onClick={saveBackdrop}
            disabled={savingBackdrop || !backdropUrl.trim()}
            className="rounded bg-category-transit px-3 py-1 font-medium text-white disabled:opacity-50"
          >
            Save
          </button>
          {trip.heroImageUrl && (
            <button onClick={useUnsplashBackdrop} disabled={savingBackdrop} className="text-text-secondary disabled:opacity-50">
              Use Unsplash instead
            </button>
          )}
          <button onClick={() => setEditingBackdrop(false)} className="text-text-secondary">
            Cancel
          </button>
        </div>
      )}

      {editingTrip && (
        <Modal onClose={() => setEditingTrip(false)}>
          <h2 className="mb-3 text-lg font-semibold text-text-primary">Edit trip</h2>
          <div className="space-y-3">
            <label className="block text-sm text-text-secondary">
              Status
              <select
                value={trip.statusOverride ?? ""}
                onChange={(e) => setStatusOverride(e.target.value)}
                disabled={savingStatus}
                className="mt-1 block w-full rounded border border-gridline bg-transparent p-2 text-sm font-medium capitalize text-text-primary disabled:opacity-50"
              >
                <option value="">Auto ({trip.status})</option>
                <option value="dreaming">Dreaming</option>
                <option value="planned">Planned</option>
                <option value="active">Active</option>
                <option value="past">Past</option>
              </select>
            </label>
            <button
              onClick={togglePrimary}
              disabled={togglingPrimary}
              className="block text-sm text-category-transit disabled:opacity-50"
            >
              {trip.isPrimary ? "★ Remove as Home trip" : "☆ Set as Home trip"}
            </button>
            <button
              onClick={archiveTrip}
              disabled={archiving}
              className="block text-sm text-status-critical disabled:opacity-50"
            >
              Archive trip
            </button>
          </div>
          <button onClick={() => setEditingTrip(false)} className="mt-4 text-sm text-text-secondary">
            Close
          </button>
        </Modal>
      )}

      {/* Trip readiness — not useful once the trip is over */}
      {trip.status !== "past" && nudges.length > 0 && (
        <section className="rounded border border-gridline bg-surface p-4">
          <h2 className="mb-2 text-sm font-semibold uppercase text-text-muted">Trip readiness</h2>
          <ul className="space-y-1">
            {nudges.map((n, i) => (
              <li
                key={i}
                className={`text-sm ${n.tone === "warning" ? "text-status-warning" : "text-text-secondary"}`}
              >
                {n.text}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Itinerary — cities, their dates/lodging, and everything scheduled */}
        <section className="lg:col-span-2">
          <h2 className="mb-2 text-sm font-semibold uppercase text-text-muted">Itinerary</h2>
          <TripItinerary tripId={tripId} onHoverPlace={setHoveredPlaceId} onActiveLegChange={setActiveLegId} />
        </section>

        <div className="space-y-4 self-start lg:sticky lg:top-20 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
          <TripWeather tripId={tripId} />
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase text-text-muted">Map</h2>
            <TripMap tripId={tripId} hoveredPlaceId={hoveredPlaceId} activeLegId={activeLegId} />
          </section>
        </div>
      </div>
    </div>
  );
}
