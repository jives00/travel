import { queryOptions } from "@tanstack/react-query";
import type { PlaceListQuery } from "@travel/types";
import type { createPlacesEndpoints } from "../endpoints/places";

export function createPlacesQueries(places: ReturnType<typeof createPlacesEndpoints>) {
  return {
    placesQuery: (query?: PlaceListQuery) =>
      queryOptions({
        queryKey: ["places", query ?? {}] as const,
        queryFn: () => places.list(query),
        // the place library rarely changes mid-session; long staleTime keeps
        // navigation between screens from silently re-fetching (see build plan §0.1)
        staleTime: 60_000,
      }),
    placeQuery: (id: number) =>
      queryOptions({
        queryKey: ["places", id] as const,
        queryFn: () => places.get(id),
      }),
  };
}
