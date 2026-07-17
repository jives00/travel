import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/queryClient";
import { getServerApi } from "@/lib/serverApi";
import { ListsView } from "./lists-view";

export default async function ListsPage() {
  const api = await getServerApi();
  const queryClient = makeQueryClient();
  await queryClient.prefetchQuery(api.queries.listsQuery());

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <ListsView />
    </HydrationBoundary>
  );
}
