import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/queryClient";
import { getServerApi } from "@/lib/serverApi";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const api = await getServerApi();
  const queryClient = makeQueryClient();
  // Prefetched, like every other query on this page: without it the funding
  // list is the only browser-side fetch here, so it renders blank during the
  // hydration gap before AuthManager.bootstrap() has an access token.
  await Promise.all([
    queryClient.prefetchQuery(api.queries.settingsQuery()),
    queryClient.prefetchQuery(api.queries.fundingSourcesQuery()),
  ]);

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SettingsForm />
    </HydrationBoundary>
  );
}
