import { queryOptions } from "@tanstack/react-query";
import type { createBookingsEndpoints } from "../endpoints/bookings";

export function createBookingsQueries(bookings: ReturnType<typeof createBookingsEndpoints>) {
  return {
    bookingsQuery: (tripId: number) =>
      queryOptions({
        queryKey: ["bookings", tripId] as const,
        queryFn: () => bookings.list(tripId),
      }),
    hotelBookingsQuery: () =>
      queryOptions({
        queryKey: ["bookings", "hotels"] as const,
        queryFn: () => bookings.hotels(),
      }),
  };
}
