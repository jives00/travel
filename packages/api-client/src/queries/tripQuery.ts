import { queryOptions } from "@tanstack/react-query";
import type { createTripsEndpoints } from "../endpoints/trips";

export function createTripQueries(trips: ReturnType<typeof createTripsEndpoints>) {
  return {
    tripsQuery: () =>
      queryOptions({
        queryKey: ["trips"] as const,
        queryFn: () => trips.list(),
      }),
    tripQuery: (id: number) =>
      queryOptions({
        queryKey: ["trips", id] as const,
        queryFn: () => trips.get(id),
      }),
    // "Fresh photo per page load" is already satisfied by the server prefetch
    // re-running on every request (trips.routes.ts picks a new random photo each
    // call) — staleTime/refetchOnMount must stay off, or the client immediately
    // re-fetches on top of the hydrated value and the hero visibly swaps photos
    // a moment after first paint.
    heroImageQuery: (id: number) =>
      queryOptions({
        queryKey: ["trips", id, "hero-image"] as const,
        queryFn: () => trips.heroImage(id),
        staleTime: Infinity,
        refetchOnMount: false,
        refetchOnWindowFocus: false,
        refetchOnReconnect: false,
      }),
    // Weather changes on the order of hours, not per-request like the hero
    // photo — a 30-minute staleTime avoids re-fetching on every navigation
    // back to the trip page while still staying reasonably fresh.
    weatherQuery: (id: number) =>
      queryOptions({
        queryKey: ["trips", id, "weather"] as const,
        queryFn: () => trips.weather(id),
        staleTime: 30 * 60_000,
      }),
  };
}
