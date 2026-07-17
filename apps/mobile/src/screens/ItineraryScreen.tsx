import { useState } from "react";
import { View, Text, ScrollView } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { daysOfLeg } from "@travel/core";
import { travelApi } from "../lib/api";

// "Plan" tab — Itinerary today; Prep + Packing land alongside it in Slice 3.
export function ItineraryScreen() {
  const { data: trips } = useQuery(travelApi.queries.tripsQuery());
  const [tripId, setTripId] = useState<number | null>(null);
  const activeTripId = tripId ?? trips?.[0]?.id ?? null;

  const { data: trip } = useQuery({
    ...travelApi.queries.tripQuery(activeTripId ?? -1),
    enabled: activeTripId != null,
  });
  const { data: items } = useQuery({
    ...travelApi.queries.itineraryQuery(activeTripId ?? -1),
    enabled: activeTripId != null,
  });

  if (!trips || trips.length === 0) {
    return (
      <View className="flex-1 items-center justify-center bg-page p-4">
        <Text className="text-text-secondary">Create a trip first.</Text>
      </View>
    );
  }

  return (
    <ScrollView className="flex-1 bg-page p-4">
      {trip?.legs.map((leg) => (
        <View key={leg.id} className="mb-4 rounded border border-gridline bg-surface p-3">
          <Text className="mb-2 font-medium text-text-primary">{leg.city}</Text>
          {daysOfLeg(leg).map((day) => {
            const dayItems = (items ?? []).filter((i) => i.legId === leg.id && i.dayIndex === day.dayIndex);
            return (
              <View key={day.dayIndex} className="mb-2 rounded border border-gridline p-2">
                <Text className="text-sm font-medium text-text-secondary">{day.label}</Text>
                {dayItems.map((item) => (
                  <Text key={item.id} className="ml-2 text-sm text-text-primary">
                    {item.activityText ?? `Place #${item.placeId}`}
                  </Text>
                ))}
              </View>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}
