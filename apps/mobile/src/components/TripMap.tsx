import { useMemo, useRef } from "react";
import { View, Text } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from "react-native-maps";
import { useQuery } from "@tanstack/react-query";
import { mapPinGroupForTag } from "@travel/core";
import { MAP_PIN_COLORS, type MapPinGroup } from "@travel/ui-tokens";
import { travelApi } from "../lib/api";

/** Trip map — the trip's places pinned by category color. Fits to the markers on
 * mount. Requires the Android Maps SDK key baked into the build (see app config). */
export function TripMap({ tripId }: { tripId: number }) {
  const { data: places } = useQuery(travelApi.queries.placesQuery({ tripId }));
  const mapRef = useRef<MapView>(null);

  const pins = useMemo(
    () => (places ?? []).filter((p) => p.lat != null && p.lng != null),
    [places],
  );

  const initialRegion = useMemo<Region | undefined>(() => {
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
  }, [pins]);

  if (pins.length === 0) {
    return <Text className="text-sm text-text-muted">No places with a location yet.</Text>;
  }

  return (
    <View className="h-64 overflow-hidden rounded border border-gridline dark:border-gridline-dark">
      <MapView
        ref={mapRef}
        provider={PROVIDER_GOOGLE}
        style={{ flex: 1 }}
        initialRegion={initialRegion}
      >
        {pins.map((p) => {
          const group = mapPinGroupForTag(p.primaryTag) as MapPinGroup;
          return (
            <Marker
              key={p.id}
              coordinate={{ latitude: p.lat, longitude: p.lng }}
              title={p.name}
              description={p.address ?? undefined}
              pinColor={MAP_PIN_COLORS[group]?.light ?? "#2a78d6"}
            />
          );
        })}
      </MapView>
    </View>
  );
}
