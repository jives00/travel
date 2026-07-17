import type { Booking, CreateBookingBody, UpdateBookingBody } from "@travel/types";
import type { createApiClient } from "../client";

type RequestFn = ReturnType<typeof createApiClient>["request"];

export function createBookingsEndpoints(request: RequestFn) {
  return {
    list: (tripId: number) => request<Booking[]>(`/api/trips/${tripId}/bookings`),
    // Cross-trip — every hotel booking (with a saved lat/lng) across all the
    // user's trips, for the map view. Not scoped under /api/trips/:tripId.
    hotels: () => request<Booking[]>("/api/bookings/hotels"),
    create: (tripId: number, body: CreateBookingBody) =>
      request<Booking>(`/api/trips/${tripId}/bookings`, { method: "POST", body }),
    update: (tripId: number, bookingId: number, body: UpdateBookingBody) =>
      request<Booking>(`/api/trips/${tripId}/bookings/${bookingId}`, { method: "PATCH", body }),
    remove: (tripId: number, bookingId: number) =>
      request<void>(`/api/trips/${tripId}/bookings/${bookingId}`, { method: "DELETE" }),
  };
}
