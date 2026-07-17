import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/queryClient";
import { getServerApi } from "@/lib/serverApi";
import { MapView } from "./map-view";

export default async function MapPage() {
  const api = await getServerApi();
  const queryClient = makeQueryClient();
  await Promise.all([
    queryClient.prefetchQuery(api.queries.mapOverviewQuery()),
    queryClient.prefetchQuery(api.queries.wishlistQuery()),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <MapView />
    </HydrationBoundary>
  );
}
