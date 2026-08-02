import { queryOptions } from "@tanstack/react-query";
import type { createDayNotesEndpoints } from "../endpoints/dayNotes";

export function createDayNotesQueries(dayNotes: ReturnType<typeof createDayNotesEndpoints>) {
  return {
    dayNotesQuery: (tripId: number) =>
      queryOptions({
        queryKey: ["dayNotes", tripId] as const,
        queryFn: () => dayNotes.list(tripId),
      }),
  };
}
