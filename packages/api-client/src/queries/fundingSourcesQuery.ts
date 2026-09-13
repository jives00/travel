import { queryOptions } from "@tanstack/react-query";
import type { createFundingSourcesEndpoints } from "../endpoints/fundingSources";

export function createFundingSourcesQueries(fundingSources: ReturnType<typeof createFundingSourcesEndpoints>) {
  return {
    fundingSourcesQuery: () =>
      queryOptions({
        queryKey: ["fundingSources"] as const,
        queryFn: () => fundingSources.list(),
        staleTime: 5 * 60_000, // a short, rarely-edited list — same as settings
      }),
  };
}
