import type { MapOverview } from "@travel/types";
import type { createApiClient } from "../client";

type RequestFn = ReturnType<typeof createApiClient>["request"];

export function createMapEndpoints(request: RequestFn) {
  return {
    overview: () => request<MapOverview>("/api/map/overview"),
  };
}
