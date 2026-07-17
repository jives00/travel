import { queryOptions } from "@tanstack/react-query";
import type { createListsEndpoints } from "../endpoints/lists";

export function createListsQueries(lists: ReturnType<typeof createListsEndpoints>) {
  return {
    listsQuery: (tripId?: number) =>
      queryOptions({
        queryKey: ["lists", tripId ?? "global"] as const,
        queryFn: () => lists.list(tripId),
      }),
  };
}
