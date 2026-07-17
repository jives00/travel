import { useState } from "react";
import { View, Text, TextInput, Pressable, FlatList } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { travelApi } from "../lib/api";

// Stopgap: Today isn't built until Slice 4 (Bookings), so this tab's stack
// currently opens straight to Trips — same simplification made on web's root page.
export function TripsScreen() {
  const queryClient = useQueryClient();
  const { data: trips } = useQuery(travelApi.queries.tripsQuery());
  const [name, setName] = useState("");

  async function createTrip() {
    if (!name.trim()) return;
    await travelApi.trips.create({ name: name.trim() });
    await queryClient.invalidateQueries({ queryKey: ["trips"] });
    setName("");
  }

  return (
    <View className="flex-1 bg-page p-4">
      <View className="mb-4 flex-row gap-2">
        <TextInput
          className="flex-1 rounded border border-gridline p-2 text-text-primary"
          placeholder="New trip name…"
          value={name}
          onChangeText={setName}
        />
        <Pressable onPress={createTrip} className="rounded bg-category-transit px-4 justify-center">
          <Text className="font-medium text-white">Create</Text>
        </Pressable>
      </View>
      <FlatList
        data={trips ?? []}
        keyExtractor={(t) => String(t.id)}
        renderItem={({ item }) => (
          <View className="mb-2 rounded border border-gridline bg-surface p-3">
            <Text className="font-medium text-text-primary">{item.name}</Text>
            <Text className="text-sm capitalize text-text-secondary">{item.status}</Text>
          </View>
        )}
        ListEmptyComponent={<Text className="text-text-secondary">No trips yet.</Text>}
      />
    </View>
  );
}
