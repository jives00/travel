"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MAP_OVERVIEW_COLORS, MAP_OVERVIEW_GROUPS, type MapOverviewGroup } from "@travel/ui-tokens";
import type { AutocompleteSuggestion } from "@travel/api-client";
import type { WishlistLocationType, WishlistStatus } from "@travel/types";
import { travelApi } from "@/lib/api";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { googleMapsUrl } from "@/lib/mapInfoWindow";
import { sessionToken as makeSessionToken } from "@/lib/sessionToken";

// Same inline-SVG pin icon as trip-map.tsx / the old map-view — a real
// <img>-based icon, not a google.maps.Symbol path (Symbol.path only supports
// a limited SVG subset with no elliptical arcs, which is why an earlier
// arc-based teardrop path silently failed to render as intended).
function pinIconUrl(color: string): string {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">
    <path d="M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24C24 5.373 18.627 0 12 0z" fill="${color}" stroke="#ffffff" stroke-width="1.5"/>
    <circle cx="12" cy="12" r="4.5" fill="#ffffff" fill-opacity="0.9"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

type MapMarker = {
  addListener: (event: string, handler: () => void) => void;
  setMap: (map: unknown) => void;
};
type MapInstance = object;
type InfoWindowInstance = { setContent: (content: string | Node) => void; open: (opts: Record<string, unknown>) => void };

// A world tile is 256 * 2^zoom px wide — if the container is wider than that,
// Google Maps tiles a second copy of the world side-by-side to fill the space
// (the "Asia/Europe twice" bug). Used once, for the map's initial zoom —
// after creation the map is left alone (no fitBounds/re-zoom on point changes)
// so the user's own pan/zoom is never overridden.
//
// Fractional (not rounded-up-to-the-next-integer) zoom, paired with
// isFractionalZoomEnabled on the map, so the world is exactly as wide as the
// container — round up to a whole zoom level and the world can end up nearly
// 2x wider than needed, hiding well over a third of all longitudes and
// clipping pins (Australia/NZ/Alaska) that would otherwise be in view.
function safeMinZoom(containerWidth: number): number {
  return Math.max(2, Math.log2(containerWidth / 256) + 0.02);
}

// Fixed center longitude, not data-driven: puts the map's seam in the
// Pacific (~150E/150W) so the layout always reads Americas on the left,
// EMEA/Asia/Australia on the right — the same reading order regardless of
// which pins happen to be present. (An earlier version picked whichever
// longitude gap between pins was widest, but with no pins in India/Central
// Asia that gap beat the actual Pacific gap, splitting the seam through
// Asia/Europe instead and leaving the Americas stranded in the middle.)
const MAP_CENTER_LNG = 0;

type GoogleMaps = {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => MapInstance;
    Marker: new (opts: Record<string, unknown>) => MapMarker;
    Size: new (w: number, h: number) => unknown;
    Point: new (x: number, y: number) => unknown;
    InfoWindow: new (opts: Record<string, unknown>) => InfoWindowInstance;
  };
};

const BUCKET_LABELS: Record<MapOverviewGroup, string> = {
  visited: "Visited",
  planned: "Planned",
  want_to_visit: "Want to visit",
};

interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  bucket: MapOverviewGroup;
  tripId?: number;
  tripName?: string;
  note?: string | null;
  wishlistId?: number;
}

// Builds the InfoWindow content as real DOM (InfoWindow#setContent accepts a
// Node, not just an HTML string) — avoids both escaping user-entered names
// and the event-delegation gymnastics a raw HTML string + inline onclick
// would need for the wishlist "Remove" button.
function buildInfoContent(point: MapPoint, onRemove: () => void): HTMLElement {
  const container = document.createElement("div");
  container.style.fontFamily = "Roboto, Arial, sans-serif";
  container.style.maxWidth = "220px";
  container.style.padding = "2px";

  const title = document.createElement("div");
  title.style.fontWeight = "600";
  title.style.fontSize = "14px";
  title.style.color = "#202124";
  title.style.marginBottom = "2px";
  title.textContent = point.name;
  container.appendChild(title);

  if (point.bucket !== "want_to_visit" && point.tripName) {
    const tripLine = document.createElement("div");
    tripLine.style.color = "#5f6368";
    tripLine.style.fontSize = "13px";
    tripLine.textContent = point.tripName;
    container.appendChild(tripLine);

    if (point.tripId != null) {
      const link = document.createElement("a");
      link.href = `/trips/${point.tripId}`;
      link.textContent = "View trip";
      link.style.display = "inline-block";
      link.style.marginTop = "4px";
      link.style.color = "#1a73e8";
      link.style.fontSize = "13px";
      link.style.textDecoration = "none";
      container.appendChild(link);
    }
  } else {
    if (point.note) {
      const note = document.createElement("div");
      note.style.color = "#5f6368";
      note.style.fontSize = "13px";
      note.style.marginTop = "2px";
      note.textContent = point.note;
      container.appendChild(note);
    }
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "Remove";
    remove.style.display = "block";
    remove.style.marginTop = "6px";
    remove.style.color = "#c5221f";
    remove.style.fontSize = "13px";
    remove.style.background = "none";
    remove.style.border = "none";
    remove.style.padding = "0";
    remove.style.cursor = "pointer";
    remove.onclick = onRemove;
    container.appendChild(remove);
  }

  const mapsLink = document.createElement("a");
  mapsLink.href = googleMapsUrl({ name: point.name, lat: point.lat, lng: point.lng });
  mapsLink.target = "_blank";
  mapsLink.rel = "noopener noreferrer";
  mapsLink.textContent = "View on Google Maps";
  mapsLink.style.display = "block";
  mapsLink.style.marginTop = "6px";
  mapsLink.style.color = "#1a73e8";
  mapsLink.style.fontSize = "13px";
  mapsLink.style.textDecoration = "none";
  container.appendChild(mapsLink);

  return container;
}

// Search box for adding a wishlist city/country — same debounced
// autocomplete + keyboard-nav pattern as HotelAddressSearch
// (booking-fields.tsx), reusing the same server-proxied Places endpoints so
// the session token/API key never reach the browser.
function WishlistAddForm({ onAdded }: { onAdded: () => void }) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const [picked, setPicked] = useState<{ name: string; lat: number; lng: number } | null>(null);
  const [type, setType] = useState<WishlistLocationType>("city");
  const [status, setStatus] = useState<WishlistStatus>("want_to_visit");
  const [note, setNote] = useState("");
  const sessionToken = useRef(makeSessionToken());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (input.trim().length < 3) {
      setSuggestions([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await travelApi.places.autocomplete(input, sessionToken.current);
        setSuggestions(results);
        setHighlighted(-1);
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [input]);

  const create = useMutation({
    mutationFn: () =>
      travelApi.wishlist.create({
        name: picked!.name,
        type,
        status,
        lat: picked!.lat,
        lng: picked!.lng,
        note: note || undefined,
      }),
    onSuccess: () => {
      setPicked(null);
      setNote("");
      setInput("");
      setStatus("want_to_visit");
      onAdded();
    },
  });

  async function pick(suggestion: AutocompleteSuggestion) {
    const details = await travelApi.places.autocompleteDetails(suggestion.placeId, sessionToken.current);
    setPicked({ name: details.name, lat: details.lat, lng: details.lng });
    setType(details.googleTypes?.includes("country") ? "country" : "city");
    setInput("");
    setSuggestions([]);
    sessionToken.current = makeSessionToken();
  }

  function onInputKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((i) => (i + 1) % suggestions.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
    } else if (e.key === "Enter" && highlighted >= 0) {
      e.preventDefault();
      void pick(suggestions[highlighted]);
    }
  }

  if (picked) {
    return (
      <div className="space-y-2 rounded border border-gridline p-3">
        <p className="text-sm font-medium text-text-primary">{picked.name}</p>
        <div className="flex gap-1.5">
          {(["city", "country"] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setType(t)}
              className={`rounded-full px-2.5 py-1 text-xs capitalize ${
                type === t ? "bg-category-transit text-white" : "bg-surface text-text-secondary"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div className="flex gap-1.5">
          {(["visited", "want_to_visit"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStatus(s)}
              className={`rounded-full px-2.5 py-1 text-xs ${
                status === s ? "text-white" : "bg-surface text-text-secondary"
              }`}
              style={status === s ? { backgroundColor: MAP_OVERVIEW_COLORS[s].light } : undefined}
            >
              {BUCKET_LABELS[s]}
            </button>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="w-full rounded border border-gridline bg-transparent p-2 text-sm text-text-primary"
          rows={2}
        />
        <div className="flex gap-2">
          <button
            type="button"
            disabled={create.isPending}
            onClick={() => create.mutate()}
            className="rounded bg-category-transit px-3 py-1.5 text-sm text-white disabled:opacity-50"
          >
            Add pin
          </button>
          <button
            type="button"
            onClick={() => setPicked(null)}
            className="rounded px-3 py-1.5 text-sm text-text-secondary hover:text-text-primary"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative">
      <input
        className="w-full rounded border border-gridline bg-transparent p-2 text-text-primary"
        placeholder="Search a city or country to add…"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={onInputKeyDown}
      />
      {searching && <p className="mt-1 text-xs text-text-muted">Searching…</p>}
      {suggestions.length > 0 && (
        <ul className="absolute z-10 mt-1 w-full rounded border border-gridline bg-surface shadow-lg">
          {suggestions.map((s, i) => (
            <li key={s.placeId}>
              <button
                type="button"
                onClick={() => void pick(s)}
                onMouseEnter={() => setHighlighted(i)}
                className={`w-full px-3 py-2 text-left text-sm text-text-primary hover:bg-category-transit/10 ${
                  i === highlighted ? "bg-category-transit/10" : ""
                }`}
              >
                {s.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export function MapView() {
  const { data: overview } = useQuery(travelApi.queries.mapOverviewQuery());
  const { data: wishlist } = useQuery(travelApi.queries.wishlistQuery());
  const queryClient = useQueryClient();

  const [visibleBuckets, setVisibleBuckets] = useState<Record<MapOverviewGroup, boolean>>({
    visited: true,
    planned: true,
    want_to_visit: true,
  });
  const [showAddForm, setShowAddForm] = useState(false);

  const mapRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const mapInstance = useRef<MapInstance | null>(null);
  const infoWindowRef = useRef<InfoWindowInstance | null>(null);
  const allMarkers = useRef<MapMarker[]>([]);

  const removeWishlist = useMutation({
    mutationFn: (id: number) => travelApi.wishlist.remove(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["wishlist"] }),
  });

  const points = useMemo<MapPoint[]>(() => {
    const pts: MapPoint[] = [];
    if (visibleBuckets.visited) {
      for (const p of overview?.visited ?? []) pts.push({ ...p, bucket: "visited" });
      // Places you've been but didn't make a full trip for (no dates/itinerary)
      // — same lightweight wishlist record as "want to visit", just tagged
      // status: "visited" so it renders in this bucket instead.
      for (const w of wishlist ?? []) {
        if (w.status !== "visited") continue;
        pts.push({ id: `wishlist-${w.id}`, name: w.name, lat: w.lat, lng: w.lng, bucket: "visited", note: w.note, wishlistId: w.id });
      }
    }
    if (visibleBuckets.planned) {
      for (const p of overview?.planned ?? []) pts.push({ ...p, bucket: "planned" });
    }
    if (visibleBuckets.want_to_visit) {
      for (const w of wishlist ?? []) {
        if (w.status !== "want_to_visit") continue;
        pts.push({ id: `wishlist-${w.id}`, name: w.name, lat: w.lat, lng: w.lng, bucket: "want_to_visit", note: w.note, wishlistId: w.id });
      }
    }
    return pts;
  }, [overview, wishlist, visibleBuckets]);

  useEffect(() => {
    let cancelled = false;
    loadGoogleMaps()
      .then(() => {
        if (!cancelled) setScriptLoaded(true);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Creates the map exactly once, centered on a whole-world view — individual
  // pins fit the bounds once the first batch of points arrives (see below).
  useEffect(() => {
    if (!scriptLoaded || !mapRef.current || mapInstance.current) return;
    const google = (window as unknown as { google: GoogleMaps }).google;
    const initialZoom = safeMinZoom(mapRef.current.clientWidth || 1024);

    mapInstance.current = new google.maps.Map(mapRef.current, {
      center: { lat: 20, lng: MAP_CENTER_LNG },
      zoom: initialZoom,
      // Lets zoom (and therefore the world's pixel width) land on a fraction
      // between the usual integer steps, so it can match the container width
      // exactly instead of jumping to the next zoom level up.
      isFractionalZoomEnabled: true,
      mapTypeControl: false,
      keyboardShortcuts: false,
      // Clamps panning/zoom-out so Google Maps can't repeat the world once
      // the map is idle/resized either (belt-and-suspenders with the
      // width-aware initial zoom above).
      restriction: {
        latLngBounds: { north: 85, south: -85, west: -180, east: 180 },
        strictBounds: true,
      },
    });
    infoWindowRef.current = new google.maps.InfoWindow({});
  }, [scriptLoaded]);

  // Rebuilds markers on the existing map instance whenever the visible point
  // set changes (filter toggles, data refresh) — reusing the same map instance
  // (rather than tearing it down) leaves the user's current pan/zoom alone.
  useEffect(() => {
    const map = mapInstance.current;
    const infoWindow = infoWindowRef.current;
    if (!scriptLoaded || !map || !infoWindow) return;
    const google = (window as unknown as { google: GoogleMaps }).google;

    for (const marker of allMarkers.current) marker.setMap(null);
    allMarkers.current = [];

    function pinIcon(bucket: MapOverviewGroup) {
      const color = MAP_OVERVIEW_COLORS[bucket].light;
      return {
        url: pinIconUrl(color),
        scaledSize: new google.maps.Size(24, 36),
        anchor: new google.maps.Point(12, 36),
      };
    }

    for (const point of points) {
      const position = { lat: point.lat, lng: point.lng };
      const marker = new google.maps.Marker({ position, map, title: point.name, icon: pinIcon(point.bucket) });
      marker.addListener("click", () => {
        infoWindow.setContent(
          buildInfoContent(point, () => {
            if (point.wishlistId != null) removeWishlist.mutate(point.wishlistId);
          }),
        );
        infoWindow.open({ map, anchor: marker });
      });
      allMarkers.current.push(marker);
    }
    // Deliberately no fitBounds()/setZoom()/setCenter() here — the map is
    // created once already showing the whole world (see above), and adding
    // pins, toggling filters, etc. shouldn't ever yank the user's own pan/
    // zoom out from under them. A previous version re-fit on every points
    // change, which fought both this fixed framing and the user's manual
    // zoom/pan.
  }, [scriptLoaded, points, removeWishlist]);

  function toggleBucket(bucket: MapOverviewGroup) {
    setVisibleBuckets((prev) => ({ ...prev, [bucket]: !prev[bucket] }));
  }

  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY) {
    return (
      <p className="text-text-muted">
        Set NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY to render the map. ({overview?.visited.length ?? 0} visited,{" "}
        {overview?.planned.length ?? 0} planned, {wishlist?.length ?? 0} on the wishlist.)
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {MAP_OVERVIEW_GROUPS.map((bucket) => (
          <button
            key={bucket}
            type="button"
            onClick={() => toggleBucket(bucket)}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-opacity ${
              visibleBuckets[bucket] ? "border-gridline text-text-primary" : "border-gridline text-text-muted opacity-50"
            }`}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: MAP_OVERVIEW_COLORS[bucket].light }}
            />
            {BUCKET_LABELS[bucket]}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setShowAddForm((v) => !v)}
          className="ml-auto rounded-full bg-category-transit px-3 py-1 text-sm text-white"
        >
          {showAddForm ? "Close" : "+ Add location"}
        </button>
      </div>

      {showAddForm && <WishlistAddForm onAdded={() => queryClient.invalidateQueries({ queryKey: ["wishlist"] })} />}

      <div ref={mapRef} className="h-[85vh] w-full rounded border border-gridline" />
    </div>
  );
}
