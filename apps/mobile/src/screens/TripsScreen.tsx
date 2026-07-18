import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, FlatList, Image } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { onlineManager } from "@tanstack/react-query";
import type { Trip } from "@travel/types";
import { earliestLegStart, latestLegEnd } from "@travel/core";
import { travelApi } from "../lib/api";
import { queryClient } from "../lib/queryClient";
import { usePullToRefresh } from "../lib/usePullToRefresh";
import { useCreateTrip } from "../lib/offlineMutations/trips";
import { Screen, TextField, Button } from "../components/ui";
import type { TripsScreenProps } from "../navigation/types";

/** Primary first; then upcoming by soonest start; then past by most-recently ended. */
function sortTrips(trips: Trip[]): Trip[] {
  const primary = trips.filter((t) => t.isPrimary);
  const rest = trips.filter((t) => !t.isPrimary);
  const upcoming = rest.filter((t) => t.status !== "past");
  const past = rest.filter((t) => t.status === "past");
  upcoming.sort((a, b) => {
    const ad = earliestLegStart(a);
    const bd = earliestLegStart(b);
    if (ad && bd) return ad.localeCompare(bd);
    if (ad) return -1;
    if (bd) return 1;
    return a.name.localeCompare(b.name);
  });
  past.sort((a, b) => {
    const ad = latestLegEnd(a);
    const bd = latestLegEnd(b);
    if (ad && bd) return bd.localeCompare(ad);
    if (ad) return -1;
    if (bd) return 1;
    return a.name.localeCompare(b.name);
  });
  return [...primary, ...upcoming, ...past];
}

function TripCard({ trip, onPress }: { trip: Trip; onPress: () => void }) {
  const autoFetched = useRef(false);
  const hasCity = trip.legs.length > 0;

  // Auto-fill the card photo once, on first sighting — but never offline (it's a
  // server-side Unsplash write) and never for a not-yet-synced temp trip.
  useEffect(() => {
    if (trip.listImageUrl || !hasCity || autoFetched.current || trip.id < 0) return;
    if (!onlineManager.isOnline()) return;
    autoFetched.current = true;
    travelApi.trips
      .listImage(trip.id)
      .then(() => queryClient.invalidateQueries({ queryKey: ["trips"] }))
      .catch(() => {});
  }, [trip.id, trip.listImageUrl, hasCity]);

  return (
    <Pressable onPress={onPress} className="mb-3 flex-1 overflow-hidden rounded border border-gridline dark:border-gridline-dark">
      <View className="aspect-[3/2] w-full bg-surface dark:bg-surface-dark">
        {trip.listImageUrl ? (
          <Image source={{ uri: trip.listImageUrl }} className="h-full w-full" resizeMode="cover" />
        ) : (
          <View className="h-full w-full bg-category-lodging opacity-70" />
        )}
        <View className="absolute inset-x-0 bottom-0 bg-black/50 p-2">
          <Text className="text-base font-semibold text-white" numberOfLines={1}>
            {trip.isPrimary ? "★ " : ""}
            {trip.name}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

export function TripsScreen({ navigation }: TripsScreenProps<"TripsList">) {
  const { data: trips } = useQuery(travelApi.queries.tripsQuery());
  const [name, setName] = useState("");
  const createTrip = useCreateTrip();
  const { refreshing, onRefresh } = usePullToRefresh();

  function onCreate() {
    if (!name.trim()) return;
    createTrip.create(name.trim());
    setName("");
  }

  const sorted = sortTrips(trips ?? []);

  return (
    <Screen padded={false}>
      <FlatList
        data={sorted}
        keyExtractor={(t) => String(t.id)}
        refreshing={refreshing}
        onRefresh={onRefresh}
        numColumns={2}
        columnWrapperStyle={{ gap: 12 }}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <View className="mb-3 flex-row gap-2">
            <TextField
              className="flex-1"
              placeholder="New trip name…"
              value={name}
              onChangeText={setName}
              onSubmitEditing={onCreate}
              returnKeyType="done"
            />
            <Button title="Create" onPress={onCreate} loading={createTrip.isPending} />
          </View>
        }
        renderItem={({ item }) => (
          <TripCard trip={item} onPress={() => navigation.navigate("TripDetail", { tripId: item.id })} />
        )}
        ListEmptyComponent={<Text className="text-text-muted">No trips yet — create one above.</Text>}
      />
    </Screen>
  );
}
