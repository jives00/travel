import { useState } from "react";
import { View, Text, Pressable, FlatList } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { enumLabel, PLACE_TAGS } from "@travel/core";
import { travelApi } from "../lib/api";
import { AutocompleteSearch } from "../components/AutocompleteSearch";
import { Screen, Card, Button } from "../components/ui";
import type { MoreScreenProps } from "../navigation/types";

/** Place library — the standing collection of saved places. Add via
 * AutocompleteSearch (online) or manual entry (offline). Tap a place for detail. */
export function PlacesScreen({ navigation }: MoreScreenProps<"Places">) {
  const { data: places } = useQuery(travelApi.queries.placesQuery());
  const [adding, setAdding] = useState(false);

  return (
    <Screen padded={false}>
      <FlatList
        data={places ?? []}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <View className="mb-3">
            {adding ? (
              <AutocompleteSearch onCreated={() => setAdding(false)} onCancel={() => setAdding(false)} />
            ) : (
              <Button title="+ Add place" onPress={() => setAdding(true)} />
            )}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable onPress={() => navigation.navigate("PlaceDetail", { placeId: item.id })}>
            <Card className="mb-2">
              <Text className="font-medium text-text-primary dark:text-text-primary-dark">{item.name}</Text>
              <Text className="text-sm capitalize text-text-secondary dark:text-text-secondary-dark">
                {item.primaryTag ? enumLabel(PLACE_TAGS, item.primaryTag) : item.category} · {item.status}
              </Text>
            </Card>
          </Pressable>
        )}
        ListEmptyComponent={<Text className="text-text-muted">No places yet.</Text>}
      />
    </Screen>
  );
}
