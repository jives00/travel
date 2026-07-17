import { queryOptions } from "@tanstack/react-query";
import type { createMapEndpoints } from "../endpoints/map";

export function createMapQueries(map: ReturnType<typeof createMapEndpoints>) {
  return {
    // Short staleTime, unlike placesQuery's long one — this aggregates live
    // trip status (today vs. leg dates), not a slow-changing place library.
    mapOverviewQuery: () =>
      queryOptions({
        queryKey: ["map", "overview"] as const,
        queryFn: () => map.overview(),
        staleTime: 10_000,
      }),
  };
}
