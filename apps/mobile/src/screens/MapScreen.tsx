import { useMemo, useState } from "react";
import { View, Text, Pressable } from "react-native";
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps";
import { useQuery } from "@tanstack/react-query";
import { MAP_OVERVIEW_COLORS, MAP_OVERVIEW_GROUPS, type MapOverviewGroup } from "@travel/ui-tokens";
import { travelApi } from "../lib/api";
import { useRemoveWishlist } from "../lib/offlineMutations/wishlist";
import { WishlistAddSheet } from "../components/WishlistAddSheet";
import { Screen, Button } from "../components/ui";

interface Point {
  id: string;
  name: string;
  lat: number;
  lng: number;
  bucket: MapOverviewGroup;
  wishlistId?: number;
}

const LABELS: Record<MapOverviewGroup, string> = {
  visited: "Visited",
  planned: "Planned",
  want_to_visit: "Want to visit",
};

/** World overview — visited/planned pins from real trips + the wishlist, with
 * bucket filters and add/remove. Mirrors web's map-view.tsx. */
export function MapScreen() {
  const { data: overview } = useQuery(travelApi.queries.mapOverviewQuery());
  const { data: wishlist } = useQuery(travelApi.queries.wishlistQuery());
  const removeWishlist = useRemoveWishlist();

  const [visible, setVisible] = useState<Record<MapOverviewGroup, boolean>>({
    visited: true,
    planned: true,
    want_to_visit: true,
  });
  const [adding, setAdding] = useState(false);

  const points = useMemo<Point[]>(() => {
    const pts: Point[] = [];
    if (visible.visited) {
      for (const p of overview?.visited ?? []) pts.push({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, bucket: "visited" });
      for (const w of wishlist ?? []) {
        if (w.status === "visited") pts.push({ id: `w-${w.id}`, name: w.name, lat: w.lat, lng: w.lng, bucket: "visited", wishlistId: w.id });
      }
    }
    if (visible.planned) {
      for (const p of overview?.planned ?? []) pts.push({ id: p.id, name: p.name, lat: p.lat, lng: p.lng, bucket: "planned" });
    }
    if (visible.want_to_visit) {
      for (const w of wishlist ?? []) {
        if (w.status === "want_to_visit")
          pts.push({ id: `w-${w.id}`, name: w.name, lat: w.lat, lng: w.lng, bucket: "want_to_visit", wishlistId: w.id });
      }
    }
    return pts;
  }, [overview, wishlist, visible]);

  return (
    <Screen padded={false}>
      <View className="flex-row flex-wrap items-center gap-2 p-3">
        {MAP_OVERVIEW_GROUPS.map((bucket) => (
          <Pressable
            key={bucket}
            onPress={() => setVisible((v) => ({ ...v, [bucket]: !v[bucket] }))}
            className={`flex-row items-center gap-1.5 rounded-full border border-gridline px-3 py-1 dark:border-gridline-dark ${
              visible[bucket] ? "" : "opacity-40"
            }`}
          >
            <View className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: MAP_OVERVIEW_COLORS[bucket].light }} />
            <Text className="text-xs text-text-primary dark:text-text-primary-dark">{LABELS[bucket]}</Text>
          </Pressable>
        ))}
        <View className="ml-auto">
          <Button title="+ Add" onPress={() => setAdding(true)} />
        </View>
      </View>

      <MapView
        provider={PROVIDER_GOOGLE}
        style={{ flex: 1 }}
        initialRegion={{ latitude: 20, longitude: 0, latitudeDelta: 100, longitudeDelta: 100 }}
      >
        {points.map((p) => (
          <Marker
            key={p.id}
            coordinate={{ latitude: p.lat, longitude: p.lng }}
            title={p.name}
            pinColor={MAP_OVERVIEW_COLORS[p.bucket].light}
            onCalloutPress={() => p.wishlistId != null && removeWishlist.mutate({ id: p.wishlistId })}
          />
        ))}
      </MapView>

      <WishlistAddSheet visible={adding} onClose={() => setAdding(false)} />
    </Screen>
  );
}
