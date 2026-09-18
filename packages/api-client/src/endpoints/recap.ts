import type { LegWeather } from "@travel/types";
import type { createApiClient } from "../client";

type RequestFn = ReturnType<typeof createApiClient>["request"];

export function createRecapEndpoints(request: RequestFn) {
  return {
    /** Per-city summary of what the weather actually was. The only part of the
     * recap that needs the server — everything else `computeRecap` derives from
     * queries both platforms already hold. */
    weather: (tripId: number) => request<LegWeather[]>(`/api/trips/${tripId}/recap/weather`),
  };
}
