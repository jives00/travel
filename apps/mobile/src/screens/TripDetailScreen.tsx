import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { travelApi } from "../lib/api";
import { TripDetailView } from "../components/TripDetailView";
import type { TripsScreenProps } from "../navigation/types";

export function TripDetailScreen({ route, navigation }: TripsScreenProps<"TripDetail">) {
  const { tripId } = route.params;
  const { data: trip } = useQuery(travelApi.queries.tripQuery(tripId));

  useEffect(() => {
    if (trip) navigation.setOptions({ title: trip.name });
  }, [trip, navigation]);

  return <TripDetailView tripId={tripId} onArchived={() => navigation.goBack()} />;
}
