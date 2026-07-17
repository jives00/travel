import { View, Text, FlatList } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { travelApi } from "../lib/api";

export function PlacesScreen() {
  const { data: places } = useQuery(travelApi.queries.placesQuery());

  return (
    <View className="flex-1 bg-page p-4">
      <FlatList
        data={places ?? []}
        keyExtractor={(p) => String(p.id)}
        renderItem={({ item }) => (
          <View className="mb-2 rounded border border-gridline bg-surface p-3">
            <Text className="font-medium text-text-primary">{item.name}</Text>
            <Text className="text-sm capitalize text-text-secondary">
              {item.category} · {item.status}
            </Text>
          </View>
        )}
        ListEmptyComponent={<Text className="text-text-secondary">No places yet.</Text>}
      />
    </View>
  );
}
