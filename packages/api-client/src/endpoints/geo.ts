import type { CityCandidate } from "@travel/types";
import type { createApiClient } from "../client";

type RequestFn = ReturnType<typeof createApiClient>["request"];

export function createGeoEndpoints(request: RequestFn) {
  return {
    /** Cities matching a free-text name, best-ranked first, for the leg city
     * picker — see `CityCandidate` in @travel/types for why picking matters. */
    searchCities: (q: string) => request<CityCandidate[]>("/api/geo/cities", { query: { q } }),
  };
}
