import { View, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { travelApi } from "../lib/api";

/**
 * NOT independently verified — react-native-maps (or Maps SDK for Android) needs
 * a custom dev client build to actually render, which this scaffolding pass
 * couldn't produce/test. Structural placeholder for now; wiring the real map view
 * is a follow-up once a dev client exists.
 */
export function MapScreen() {
  const { data: places } = useQuery(travelApi.queries.placesQuery());

  return (
    <View className="flex-1 items-center justify-center bg-page p-4">
      <Text className="text-text-secondary">{places?.length ?? 0} places saved. Map rendering pending a dev client build.</Text>
    </View>
  );
}
