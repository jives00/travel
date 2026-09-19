import { queryOptions } from "@tanstack/react-query";
import type { createGeoEndpoints } from "../endpoints/geo";

export function createGeoQueries(geo: ReturnType<typeof createGeoEndpoints>) {
  return {
    /** Disabled below two characters — the API returns [] for those anyway, and
     * not asking is cheaper than asking and ignoring. Results are cached for a
     * while because the same handful of city names get retyped constantly while
     * a trip is being built, and a city's coordinates do not move. */
    citySearchQuery: (q: string) =>
      queryOptions({
        queryKey: ["geo", "cities", q.trim()] as const,
        queryFn: () => geo.searchCities(q.trim()),
        enabled: q.trim().length >= 2,
        staleTime: 10 * 60_000,
      }),
  };
}
