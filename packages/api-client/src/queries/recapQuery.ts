import { queryOptions } from "@tanstack/react-query";
import type { createRecapEndpoints } from "../endpoints/recap";

export function createRecapQueries(recap: ReturnType<typeof createRecapEndpoints>) {
  return {
    recapWeatherQuery: (tripId: number, enabled = true) =>
      queryOptions({
        queryKey: ["recapWeather", tripId] as const,
        queryFn: () => recap.weather(tripId),
        // Past weather never changes and the server caches it per leg — so once
        // it's in hand there is no reason to refetch it this session.
        staleTime: Infinity,
        enabled,
      }),
  };
}
