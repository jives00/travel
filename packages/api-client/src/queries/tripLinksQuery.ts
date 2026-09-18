import { queryOptions } from "@tanstack/react-query";
import type { createTripLinksEndpoints } from "../endpoints/tripLinks";

export function createTripLinksQueries(tripLinks: ReturnType<typeof createTripLinksEndpoints>) {
  return {
    tripLinksQuery: (tripId: number) =>
      queryOptions({
        queryKey: ["tripLinks", tripId] as const,
        queryFn: () => tripLinks.list(tripId),
      }),
  };
}
