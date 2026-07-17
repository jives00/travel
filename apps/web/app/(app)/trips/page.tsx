import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/queryClient";
import { getServerApi } from "@/lib/serverApi";
import { TripsList } from "./trips-list";

// Server Component: prefetches the primary above-the-fold query and hydrates it,
// so first paint shows real trip data instead of a spinner (§0.1 performance
// requirement — the opposite of Trakt's blank-shell-then-fetch pattern).
export default async function TripsPage() {
  const api = await getServerApi();
  const queryClient = makeQueryClient();
  await queryClient.prefetchQuery(api.queries.tripsQuery());

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TripsList />
    </HydrationBoundary>
  );
}
