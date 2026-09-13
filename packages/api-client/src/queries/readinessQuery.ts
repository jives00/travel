import { queryOptions } from "@tanstack/react-query";
import type { createReadinessEndpoints } from "../endpoints/readiness";

export function createReadinessQueries(readiness: ReturnType<typeof createReadinessEndpoints>) {
  return {
    readinessDismissalsQuery: (tripId: number) =>
      queryOptions({
        queryKey: ["readinessDismissals", tripId] as const,
        queryFn: () => readiness.listDismissals(tripId),
      }),
  };
}
