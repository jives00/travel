import { View, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { resolveHomeTrip } from "@travel/core";
import { travelApi } from "../lib/api";
import { TripDetailView } from "../components/TripDetailView";
import { Screen } from "../components/ui";

/** Home shows the active/primary trip's detail — or an empty state when nothing
 * qualifies (a real, expected state, not an error). */
export function HomeScreen() {
  const { data: trips } = useQuery(travelApi.queries.tripsQuery());
  const home = resolveHomeTrip(trips ?? []);

  if (!home) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <Text className="mb-2 text-lg font-semibold text-text-primary dark:text-text-primary-dark">
            No active trip right now
          </Text>
          <Text className="text-center text-text-secondary dark:text-text-secondary-dark">
            Home shows whichever trip is active, or the one you&apos;ve pinned as your Home trip.
          </Text>
        </View>
      </Screen>
    );
  }

  return <TripDetailView tripId={home.id} />;
}
