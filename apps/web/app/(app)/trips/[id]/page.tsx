import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/queryClient";
import { getServerApi } from "@/lib/serverApi";
import { TripDetail } from "./trip-detail";

export default async function TripDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tripId = Number(id);
  const api = await getServerApi();
  const queryClient = makeQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(api.queries.tripQuery(tripId)),
    queryClient.prefetchQuery(api.queries.heroImageQuery(tripId)),
    queryClient.prefetchQuery(api.queries.itineraryQuery(tripId)),
    queryClient.prefetchQuery(api.queries.placesQuery({ tripId })),
    queryClient.prefetchQuery(api.queries.bookingsQuery(tripId)),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TripDetail tripId={tripId} />
    </HydrationBoundary>
  );
}
