import { onlineManager } from "@tanstack/react-query";
import { resolveHomeTrip } from "@travel/core";
import { travelApi } from "./api";
import { queryClient } from "./queryClient";

/**
 * Pin the primary/home trip's whole graph into the (persisted) cache so the app
 * is fully usable for that trip even after the NAS goes dark mid-trip. `gcTime`
 * is already Infinity globally, so once these are fetched they stay resident and
 * are captured in every persisted snapshot.
 *
 * Best-effort: called on login and on foreground while online. If we're offline
 * the fetches simply fail and we keep whatever the last snapshot held — which is
 * the entire point.
 */
export async function prefetchPrimaryTrip(): Promise<void> {
  // Don't even attempt a fetch when we already know we're offline — the cache
  // already holds the last-known primary trip; a request would just time out.
  if (!onlineManager.isOnline()) return;
  const trips = await travelApi.trips.list().catch(() => null);
  if (!trips) return;
  queryClient.setQueryData(["trips"], trips);

  const home = resolveHomeTrip(trips);
  if (!home) return;
  const id = home.id;

  await Promise.allSettled([
    queryClient.prefetchQuery(travelApi.queries.tripQuery(id)),
    queryClient.prefetchQuery(travelApi.queries.heroImageQuery(id)),
    queryClient.prefetchQuery(travelApi.queries.itineraryQuery(id)),
    queryClient.prefetchQuery(travelApi.queries.placesQuery({ tripId: id })),
    queryClient.prefetchQuery(travelApi.queries.bookingsQuery(id)),
    queryClient.prefetchQuery(travelApi.queries.budgetQuery(id)),
    queryClient.prefetchQuery(travelApi.queries.expensesQuery(id)),
    queryClient.prefetchQuery(travelApi.queries.weatherQuery(id)),
    // Settings + the whole place library are cheap and useful offline too.
    queryClient.prefetchQuery(travelApi.queries.settingsQuery()),
  ]);
}
