"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MAP_PIN_COLORS, DARK_MAP_STYLE, type MapPinGroup } from "@travel/ui-tokens";
import { mapPinGroupForTag, mapPinGroupForBookingType } from "@travel/core";
import { travelApi } from "@/lib/api";
import { loadGoogleMaps } from "@/lib/googleMaps";
import { infoWindowHtml } from "@/lib/mapInfoWindow";
import { useTheme } from "@/lib/theme-context";

// Same inline-SVG pin icon as the standalone /map page's MapView — a real
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

// Same Maps JS loading pattern as the standalone /map page, scoped to this
// trip's places instead of the whole library, and auto-fit to their bounds
// (not just centered on the first result) since a trip usually spans more
// than one point of interest.
type MapMarker = {
  addListener: (event: string, handler: () => void) => void;
  setAnimation: (animation: unknown) => void;
  setMap: (map: unknown) => void;
};

type MapInstance = { fitBounds: (bounds: unknown) => void; setOptions: (opts: Record<string, unknown>) => void };
type InfoWindowInstance = { setContent: (html: string) => void; open: (opts: Record<string, unknown>) => void };

type GoogleMaps = {
  maps: {
    Map: new (el: HTMLElement, opts: Record<string, unknown>) => MapInstance;
    Marker: new (opts: Record<string, unknown>) => MapMarker;
    LatLngBounds: new () => { extend: (position: unknown) => void };
    Size: new (w: number, h: number) => unknown;
    Point: new (x: number, y: number) => unknown;
    InfoWindow: new (opts: Record<string, unknown>) => InfoWindowInstance;
    Animation: { BOUNCE: unknown };
  };
};

export function TripMap({
  tripId,
  hoveredPlaceId,
  activeLegId,
}: {
  tripId: number;
  hoveredPlaceId?: number | null;
  // Whichever leg's itinerary section is currently scrolled into view (null
  // for "no specific city") — drives the city filter automatically, while
  // still leaving the filter pills clickable for a manual override.
  activeLegId?: number | null;
}) {
  const { data: places } = useQuery(travelApi.queries.placesQuery({ tripId }));
  const { data: bookings } = useQuery(travelApi.queries.bookingsQuery(tripId));
  const { data: items } = useQuery(travelApi.queries.itineraryQuery(tripId));
  const { data: settings } = useQuery(travelApi.queries.settingsQuery());
  const { data: trip } = useQuery(travelApi.queries.tripQuery(tripId));
  const { theme } = useTheme();
  const mapRef = useRef<HTMLDivElement>(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const markersByPlaceId = useRef<Map<number, MapMarker>>(new Map());
  // Kept alive across renders rather than recreated per filter change — that
  // was the actual cause of the "abrupt" city-switch feel: rebuilding the
  // whole google.maps.Map instance on every filter reloads all the tiles
  // from scratch instead of letting Maps animate the existing view over.
  const mapInstance = useRef<MapInstance | null>(null);
  const infoWindowRef = useRef<InfoWindowInstance | null>(null);
  const allMarkers = useRef<MapMarker[]>([]);
  const [cityFilter, setCityFilter] = useState<number | "all">("all");

  useEffect(() => {
    setCityFilter(activeLegId ?? "all");
  }, [activeLegId]);
  // Day trips clutter the map by default (they're often far outside the
  // city's normal bounds) — hidden unless explicitly turned on.
  const [includeDayTrips, setIncludeDayTrips] = useState(false);

  // Same rule the itinerary list applies — a place scheduled as a private
  // itinerary item drops off the map too when "show private items" is off.
  // Defaults to hidden while settings are still loading, same reasoning as
  // TripItinerary: briefly under-showing beats a flash of private markers.
  const showPrivate = settings?.showPrivateItems ?? false;
  const privatePlaceIds = useMemo(
    () =>
      new Set(
        (items ?? [])
          .filter((i) => i.itemType === "place" && i.isPrivate && i.placeId != null)
          .map((i) => i.placeId as number),
      ),
    [items],
  );
  // A place checked off done/visited drops off the map entirely, same as the
  // itinerary list dropping it to the bottom.
  const completedPlaceIds = useMemo(
    () =>
      new Set(
        (items ?? [])
          .filter((i) => i.itemType === "place" && i.completed && i.placeId != null)
          .map((i) => i.placeId as number),
      ),
    [items],
  );
  const visiblePlaces = useMemo(
    () => (places ?? []).filter((p) => (showPrivate || !privatePlaceIds.has(p.id)) && !completedPlaceIds.has(p.id)),
    [places, showPrivate, privatePlaceIds, completedPlaceIds],
  );

  // Which leg(s) each place is scheduled onto, from the itinerary — a place
  // just sitting in the trip's ideas tray (no scheduled itinerary item) has
  // none, so it drops out whenever a specific city is selected.
  const placeLegIds = useMemo(() => {
    const map = new Map<number, Set<number>>();
    for (const i of items ?? []) {
      if (i.itemType === "place" && i.placeId != null && i.legId != null) {
        if (!map.has(i.placeId)) map.set(i.placeId, new Set());
        map.get(i.placeId)!.add(i.legId);
      }
    }
    return map;
  }, [items]);

  const legOptions = trip?.legs ?? [];

  // City filter only narrows places — hotel markers aren't tagged with a
  // category, so only the city filter applies to them.
  const filteredPlaces = useMemo(
    () =>
      visiblePlaces.filter((p) => {
        if (cityFilter !== "all" && !placeLegIds.get(p.id)?.has(cityFilter)) return false;
        if (!includeDayTrips && p.primaryTag === "day_trip") return false;
        return true;
      }),
    [visiblePlaces, cityFilter, includeDayTrips, placeLegIds],
  );

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

  // Any booking can carry its own address/lat/lng directly (see
  // booking-fields.tsx's LocationSearch) — no library Place link required, so
  // they're plotted independently of `places`, not looked up through one. A
  // booking checked off done drops off the map, same as a completed place.
  const bookingMarkers = useMemo(
    () =>
      (bookings ?? []).filter(
        (b): b is typeof b & { lat: number; lng: number } => b.lat != null && b.lng != null && !b.completed,
      ),
    [bookings],
  );
  // Bookings aren't category-filtered (see filteredPlaces above) but they are
  // still narrowed by city, so a "just this leg" filter doesn't leave a
  // different city's booking pin behind.
  const filteredBookingMarkers = useMemo(
    () => (cityFilter === "all" ? bookingMarkers : bookingMarkers.filter((b) => b.legId === cityFilter)),
    [bookingMarkers, cityFilter],
  );

  const hasAnyMarker = visiblePlaces.length > 0 || bookingMarkers.length > 0;

  // Creates the map exactly once. Re-runs only if the map hasn't been built
  // yet by the time markers first become available (e.g. data arrives after
  // the script finishes loading).
  useEffect(() => {
    if (!scriptLoaded || !mapRef.current || !hasAnyMarker || mapInstance.current) return;
    const google = (window as unknown as { google: GoogleMaps }).google;
    // Falls back to an unfiltered position so the map still has somewhere to
    // center when the current filters happen to match nothing.
    const anchor = filteredPlaces[0] ?? visiblePlaces[0] ?? filteredBookingMarkers[0] ?? bookingMarkers[0];
    const firstPosition = { lat: anchor.lat, lng: anchor.lng };
    mapInstance.current = new google.maps.Map(mapRef.current, {
      center: firstPosition,
      zoom: 12,
      mapTypeControl: false,
      // Copyright/terms/"report a map error" attribution is required by
      // Google's Maps Platform TOS and can't be removed — this only hides
      // the keyboard-shortcuts help text, which is optional UI.
      keyboardShortcuts: false,
      styles: theme === "dark" ? DARK_MAP_STYLE : undefined,
    });
    // One shared InfoWindow, repositioned/re-filled per click — matches how
    // Google Maps itself behaves (clicking a new pin replaces the open card
    // rather than stacking multiple).
    infoWindowRef.current = new google.maps.InfoWindow({});
  }, [scriptLoaded, hasAnyMarker, filteredPlaces, visiblePlaces, filteredBookingMarkers, bookingMarkers, theme]);

  // The map above is only ever constructed once (guarded by mapInstance.current),
  // so a theme flip after that needs to restyle the existing instance directly.
  useEffect(() => {
    mapInstance.current?.setOptions({ styles: theme === "dark" ? DARK_MAP_STYLE : [] });
  }, [theme]);

  // Rebuilds markers and re-fits bounds on the *existing* map instance
  // whenever the filtered set changes — reusing the same map (instead of
  // constructing a new one, which used to happen on every filter change) is
  // what lets Google Maps animate the pan/zoom smoothly between cities.
  useEffect(() => {
    const map = mapInstance.current;
    const infoWindow = infoWindowRef.current;
    if (!scriptLoaded || !map || !infoWindow) return;
    const google = (window as unknown as { google: GoogleMaps }).google;

    for (const marker of allMarkers.current) marker.setMap(null);
    allMarkers.current = [];
    markersByPlaceId.current.clear();

    const bounds = new google.maps.LatLngBounds();

    function pinIcon(group: MapPinGroup) {
      const color = MAP_PIN_COLORS[group]?.light ?? MAP_PIN_COLORS.other.light;
      return {
        url: pinIconUrl(color),
        scaledSize: new google.maps.Size(24, 36),
        anchor: new google.maps.Point(12, 36),
      };
    }

    let plotted = 0;
    for (const place of filteredPlaces) {
      const position = { lat: place.lat, lng: place.lng };
      const marker = new google.maps.Marker({
        position,
        map,
        title: place.name,
        icon: pinIcon(mapPinGroupForTag(place.primaryTag) as MapPinGroup),
      });
      marker.addListener("click", () => {
        infoWindow.setContent(
          infoWindowHtml({ name: place.name, address: place.address, lat: place.lat, lng: place.lng, googlePlaceId: place.googlePlaceId }),
        );
        infoWindow.open({ map, anchor: marker });
      });
      bounds.extend(position);
      markersByPlaceId.current.set(place.id, marker);
      allMarkers.current.push(marker);
      plotted++;
    }

    for (const booking of filteredBookingMarkers) {
      const position = { lat: booking.lat, lng: booking.lng };
      const marker = new google.maps.Marker({
        position,
        map,
        title: booking.title,
        icon: pinIcon(mapPinGroupForBookingType(booking.type) as MapPinGroup),
      });
      marker.addListener("click", () => {
        infoWindow.setContent(infoWindowHtml({ name: booking.title, address: booking.address, lat: booking.lat, lng: booking.lng }));
        infoWindow.open({ map, anchor: marker });
      });
      bounds.extend(position);
      allMarkers.current.push(marker);
      plotted++;
    }

    if (plotted > 0) map.fitBounds(bounds);
  }, [scriptLoaded, filteredPlaces, filteredBookingMarkers]);

  // Bounce the marker for whichever place is currently hovered in the
  // itinerary list, so the two views visibly link up.
  useEffect(() => {
    if (!scriptLoaded) return;
    const google = (window as unknown as { google: GoogleMaps }).google;
    const marker = hoveredPlaceId != null ? markersByPlaceId.current.get(hoveredPlaceId) : undefined;
    marker?.setAnimation(google.maps.Animation.BOUNCE);
    return () => {
      marker?.setAnimation(null);
    };
  }, [scriptLoaded, hoveredPlaceId, filteredPlaces]);

  if (!process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY) {
    return <p className="text-sm text-text-muted">Set NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY to render the map.</p>;
  }
  if (!hasAnyMarker) {
    return <p className="text-sm text-text-muted">No places or bookings with a location yet.</p>;
  }

  const hasFilteredMarker = filteredPlaces.length > 0 || filteredBookingMarkers.length > 0;

  return (
    <div className="space-y-2">
      <div className="relative h-[32rem] w-full">
        <div ref={mapRef} className="h-full w-full rounded border border-gridline" />
        {!hasFilteredMarker && (
          <div className="absolute inset-0 flex items-center justify-center rounded bg-page/80 text-sm text-text-muted">
            No matches for these filters.
          </div>
        )}
      </div>

      {legOptions.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setCityFilter("all")}
            className={`rounded-full px-2.5 py-1 text-xs ${
              cityFilter === "all" ? "bg-category-transit text-white" : "bg-surface text-text-secondary hover:text-text-primary"
            }`}
          >
            All cities
          </button>
          {legOptions.map((leg) => (
            <button
              key={leg.id}
              onClick={() => setCityFilter(leg.id)}
              className={`rounded-full px-2.5 py-1 text-xs ${
                cityFilter === leg.id ? "bg-category-transit text-white" : "bg-surface text-text-secondary hover:text-text-primary"
              }`}
            >
              {leg.city}
            </button>
          ))}
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-text-secondary">
        <input type="checkbox" checked={includeDayTrips} onChange={(e) => setIncludeDayTrips(e.target.checked)} />
        Include day trips
      </label>
    </div>
  );
}
