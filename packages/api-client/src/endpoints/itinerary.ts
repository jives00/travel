import type { ItineraryItem, MoveItemBody, ScheduleItemBody } from "@travel/types";
import type { createApiClient } from "../client";

type RequestFn = ReturnType<typeof createApiClient>["request"];

export function createItineraryEndpoints(request: RequestFn) {
  return {
    list: (tripId: number) => request<ItineraryItem[]>(`/api/trips/${tripId}/itinerary`),
    schedule: (tripId: number, body: ScheduleItemBody) =>
      request<ItineraryItem>(`/api/trips/${tripId}/itinerary`, { method: "POST", body }),
    move: (tripId: number, itemId: number, body: MoveItemBody) =>
      request<ItineraryItem>(`/api/trips/${tripId}/itinerary/${itemId}`, { method: "PATCH", body }),
    unschedule: (tripId: number, itemId: number) =>
      request<void>(`/api/trips/${tripId}/itinerary/${itemId}`, { method: "DELETE" }),
  };
}
