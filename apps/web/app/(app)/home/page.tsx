import Link from "next/link";
import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { resolveHomeTrip } from "@travel/core";
import { makeQueryClient } from "@/lib/queryClient";
import { getServerApi } from "@/lib/serverApi";
import { TripDetail } from "../trips/[id]/trip-detail";

// Home shows whichever trip is "active" — a manually pinned primary trip wins
// (the tiebreaker for when more than one trip's status happens to be active),
// otherwise the first trip computed/overridden to active. No trip qualifying is
// a real, expected state (nothing upcoming right now), not an error — the empty
// state carries the primary action (spec cross-cutting rule), not a redirect.
export default async function HomePage() {
  const api = await getServerApi();
  const trips = await api.trips.list();
  const homeTrip = resolveHomeTrip(trips);

  if (!homeTrip) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-semibold text-text-primary">No active trip right now</h1>
        <p className="text-text-secondary">
          Home shows whichever trip is active, or the one you&apos;ve pinned as your Home trip.
        </p>
        <Link
          href="/trips"
          className="inline-block rounded bg-category-transit px-4 py-2 text-sm font-medium text-white"
        >
          View all trips
        </Link>
      </div>
    );
  }

  const queryClient = makeQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(api.queries.tripQuery(homeTrip.id)),
    queryClient.prefetchQuery(api.queries.heroImageQuery(homeTrip.id)),
    queryClient.prefetchQuery(api.queries.itineraryQuery(homeTrip.id)),
    queryClient.prefetchQuery(api.queries.placesQuery({ tripId: homeTrip.id })),
    queryClient.prefetchQuery(api.queries.bookingsQuery(homeTrip.id)),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TripDetail tripId={homeTrip.id} />
    </HydrationBoundary>
  );
}
