import { queryOptions } from "@tanstack/react-query";
import type { createItineraryEndpoints } from "../endpoints/itinerary";

export function createItineraryQueries(itinerary: ReturnType<typeof createItineraryEndpoints>) {
  return {
    itineraryQuery: (tripId: number) =>
      queryOptions({
        queryKey: ["itinerary", tripId] as const,
        queryFn: () => itinerary.list(tripId),
      }),
  };
}
