import { useEffect, useMemo, useRef, useState } from "react";
import { View, Text, Pressable } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from "react-native-maps";
import { useQuery } from "@tanstack/react-query";
import { mapPinGroupForTag, mapPinGroupForBookingType } from "@travel/core";
import { MAP_PIN_COLORS, type MapPinGroup } from "@travel/ui-tokens";
import { travelApi } from "../lib/api";

function regionForPins(pins: { lat: number; lng: number }[]): Region | undefined {
  if (pins.length === 0) return undefined;
  const lats = pins.map((p) => p.lat);
  const lngs = pins.map((p) => p.lng);
  const minLat = Math.min(...lats);
  const maxLat = Math.max(...lats);
  const minLng = Math.min(...lngs);
  const maxLng = Math.max(...lngs);
  return {
    latitude: (minLat + maxLat) / 2,
    longitude: (minLng + maxLng) / 2,
    latitudeDelta: Math.max(0.05, (maxLat - minLat) * 1.4),
    longitudeDelta: Math.max(0.05, (maxLng - minLng) * 1.4),
  };
}

function FilterPill({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      className={`rounded-full px-3.5 py-2 ${active ? "bg-category-transit" : "bg-surface dark:bg-surface-dark"}`}
    >
      <Text className={`text-sm ${active ? "text-white" : "text-text-secondary dark:text-text-secondary-dark"}`}>{label}</Text>
    </Pressable>
  );
}

/** Trip map — the trip's places pinned by category color, with the same
 * city/category/day-trip filters as web's trip-map.tsx. Fits the camera to
 * whichever pins are currently visible, and a "Reset view" action snaps
 * back to all pins in case the map was panned/zoomed by hand. Requires the
 * Android Maps SDK key baked into the build (see app config). */
export function TripMap({ tripId }: { tripId: number }) {
  const { data: places } = useQuery(travelApi.queries.placesQuery({ tripId }));
  const { data: items } = useQuery(travelApi.queries.itineraryQuery(tripId));
  const { data: trip } = useQuery(travelApi.queries.tripQuery(tripId));
  const { data: bookings } = useQuery(travelApi.queries.bookingsQuery(tripId));
  const mapRef = useRef<MapView>(null);

  const [cityFilter, setCityFilter] = useState<number | "all">("all");
  const [includeDayTrips, setIncludeDayTrips] = useState(false);
  const [mapReady, setMapReady] = useState(false);

  // A place checked off done/visited drops off the map, same as the
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
    () => (places ?? []).filter((p) => p.lat != null && p.lng != null && !completedPlaceIds.has(p.id)),
    [places, completedPlaceIds],
  );

  // Any booking can carry its own address/lat/lng directly — plotted
  // independently of `places`, same as web's trip-map.tsx. A booking checked
  // off done drops off the map, same as a completed place.
  const visibleBookings = useMemo(
    () =>
      (bookings ?? []).filter(
        (b): b is typeof b & { lat: number; lng: number } => b.lat != null && b.lng != null && !b.completed,
      ),
    [bookings],
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

  const filteredPins = useMemo(
    () =>
      visiblePlaces.filter((p) => {
        if (cityFilter !== "all" && !placeLegIds.get(p.id)?.has(cityFilter)) return false;
        if (!includeDayTrips && p.primaryTag === "day_trip") return false;
        return true;
      }),
    [visiblePlaces, cityFilter, includeDayTrips, placeLegIds],
  );

  // Bookings aren't category-filtered (see filteredPins above) but they are
  // still narrowed by city, same as web's trip-map.tsx.
  const filteredBookingPins = useMemo(
    () => (cityFilter === "all" ? visibleBookings : visibleBookings.filter((b) => b.legId === cityFilter)),
    [visibleBookings, cityFilter],
  );

  const allPins = useMemo(
    () => [...visiblePlaces, ...visibleBookings.map((b) => ({ lat: b.lat, lng: b.lng }))],
    [visiblePlaces, visibleBookings],
  );
  const initialRegion = useMemo(() => regionForPins(allPins), [allPins]);

  // Re-fit the camera to whatever's currently visible whenever the filters
  // change — mirrors web's fitBounds-on-filter-change behavior. Gated on
  // onMapReady below: firing this from an effect on mount races the native
  // view's async init on Android and can update state before it's mounted.
  //
  // Uses animateToRegion (not fitToCoordinates) because fitToCoordinates
  // computes a zero-area bounding box for a single pin — a one-place city
  // filter would then just re-center at whatever zoom the map already had
  // instead of zooming in. regionForPins already floors the delta to a
  // sensible single-pin zoom level.
  useEffect(() => {
    const combined = [...filteredPins, ...filteredBookingPins];
    if (!mapReady || combined.length === 0) return;
    const region = regionForPins(combined);
    if (region) mapRef.current?.animateToRegion(region, 500);
  }, [mapReady, filteredPins, filteredBookingPins]);

  function resetView() {
    setCityFilter("all");
    setIncludeDayTrips(false);
    // Filters resetting to "all" may leave filteredPins unchanged (already
    // all), which wouldn't re-trigger the fit effect above — so also fit
    // explicitly here to guarantee a manually panned/zoomed map snaps back.
    if (mapReady && initialRegion) {
      mapRef.current?.animateToRegion(initialRegion, 500);
    }
  }

  if (allPins.length === 0) {
    return <Text className="text-sm text-text-muted">No places or bookings with a location yet.</Text>;
  }

  return (
    <View>
      <View className="h-64 overflow-hidden rounded border border-gridline dark:border-gridline-dark">
        <MapView
          ref={mapRef}
          provider={PROVIDER_GOOGLE}
          style={{ flex: 1 }}
          initialRegion={initialRegion}
          onMapReady={() => setMapReady(true)}
        >
          {filteredPins.map((p) => {
            const group = mapPinGroupForTag(p.primaryTag) as MapPinGroup;
            return (
              <Marker
                key={`place-${p.id}`}
                coordinate={{ latitude: p.lat, longitude: p.lng }}
                title={p.name}
                description={p.address ?? undefined}
                pinColor={MAP_PIN_COLORS[group]?.light ?? "#2a78d6"}
              />
            );
          })}
          {filteredBookingPins.map((b) => {
            const group = mapPinGroupForBookingType(b.type) as MapPinGroup;
            return (
              <Marker
                key={`booking-${b.id}`}
                coordinate={{ latitude: b.lat, longitude: b.lng }}
                title={b.title}
                description={b.address ?? undefined}
                pinColor={MAP_PIN_COLORS[group]?.light ?? "#2a78d6"}
              />
            );
          })}
        </MapView>
        {filteredPins.length === 0 && filteredBookingPins.length === 0 && (
          <View className="absolute inset-0 items-center justify-center bg-page/80 dark:bg-page-dark/80">
            <Text className="text-sm text-text-muted">No matches for these filters.</Text>
          </View>
        )}
      </View>

      {legOptions.length > 0 && (
        <View className="mt-2 flex-row flex-wrap gap-1.5">
          <FilterPill label="All cities" active={cityFilter === "all"} onPress={() => setCityFilter("all")} />
          {legOptions.map((leg) => (
            <FilterPill key={leg.id} label={leg.city} active={cityFilter === leg.id} onPress={() => setCityFilter(leg.id)} />
          ))}
        </View>
      )}

      <View className="mt-2 flex-row items-center justify-between">
        <Pressable className="flex-row items-center gap-2" onPress={() => setIncludeDayTrips((v) => !v)}>
          <View
            className={`h-4 w-4 items-center justify-center rounded border ${
              includeDayTrips ? "border-category-transit bg-category-transit" : "border-gridline dark:border-gridline-dark"
            }`}
          >
            {includeDayTrips && <Text className="text-[10px] leading-none text-white">✓</Text>}
          </View>
          <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">Include day trips</Text>
        </Pressable>

        <Pressable onPress={resetView}>
          <Text className="text-sm text-category-transit">Reset view</Text>
        </Pressable>
      </View>
    </View>
  );
}
