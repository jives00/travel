import { useEffect } from "react";
import { View, Text, Image, Linking, ScrollView } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { PlaceStatus } from "@travel/types";
import { enumLabel, PLACE_TAGS } from "@travel/core";
import { travelApi } from "../lib/api";
import { useUpdatePlace, useRemovePlace } from "../lib/offlineMutations/places";
import { Card, SegmentedControl, Button } from "../components/ui";
import type { MoreScreenProps } from "../navigation/types";

export function PlaceDetailScreen({ route, navigation }: MoreScreenProps<"PlaceDetail">) {
  const { placeId } = route.params;
  const { data: place } = useQuery(travelApi.queries.placeQuery(placeId));
  const update = useUpdatePlace();
  const remove = useRemovePlace();

  useEffect(() => {
    if (place) navigation.setOptions({ title: place.name });
  }, [place, navigation]);

  if (!place) return null;

  return (
    <ScrollView className="flex-1 bg-page p-4 dark:bg-page-dark">
      {place.heroPhotoUrl ? (
        <Image source={{ uri: place.heroPhotoUrl }} className="mb-3 h-48 w-full rounded" resizeMode="cover" />
      ) : null}

      <Text className="text-xl font-bold text-text-primary dark:text-text-primary-dark">{place.name}</Text>
      <Text className="mb-3 text-sm text-text-secondary dark:text-text-secondary-dark">
        {place.primaryTag ? enumLabel(PLACE_TAGS, place.primaryTag) : place.category}
        {place.rating ? ` · ★ ${place.rating}${place.userRatingsTotal ? ` (${place.userRatingsTotal})` : ""}` : ""}
      </Text>

      <Text className="mb-1 text-xs font-semibold uppercase text-text-muted">Status</Text>
      <SegmentedControl
        className="mb-4"
        value={place.status}
        onChange={(status) => update.mutate({ id: placeId, body: { status: status as PlaceStatus } })}
        segments={[
          { value: "idea", label: "Idea" },
          { value: "planned", label: "Planned" },
          { value: "visited", label: "Visited" },
        ]}
      />

      {place.description ? (
        <Card className="mb-3">
          <Text className="text-sm text-text-primary dark:text-text-primary-dark">{place.description}</Text>
        </Card>
      ) : null}

      {place.address ? (
        <Text className="mb-1 text-sm text-text-secondary dark:text-text-secondary-dark">{place.address}</Text>
      ) : null}
      {place.website ? (
        <Text className="mb-3 text-sm text-category-transit" onPress={() => Linking.openURL(place.website!)}>
          {place.website}
        </Text>
      ) : null}

      <View className="mt-2 gap-2">
        <Button
          variant="secondary"
          title="Open in Google Maps"
          onPress={() =>
            Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lng}`)
          }
        />
        <Button
          variant="danger"
          title="Delete place"
          loading={remove.isPending}
          onPress={() => {
            remove.mutate({ id: placeId });
            navigation.goBack();
          }}
        />
      </View>
    </ScrollView>
  );
}
