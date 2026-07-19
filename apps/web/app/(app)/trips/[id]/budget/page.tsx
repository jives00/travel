import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/queryClient";
import { getServerApi } from "@/lib/serverApi";
import { TripBudget } from "./trip-budget";

export default async function TripBudgetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const tripId = Number(id);
  const api = await getServerApi();
  const queryClient = makeQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(api.queries.tripQuery(tripId)),
    queryClient.prefetchQuery(api.queries.budgetQuery(tripId)),
    queryClient.prefetchQuery(api.queries.expensesQuery(tripId)),
    queryClient.prefetchQuery(api.queries.bookingsQuery(tripId)),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <TripBudget tripId={tripId} />
    </HydrationBoundary>
  );
}
