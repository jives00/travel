import { HydrationBoundary, dehydrate } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/queryClient";
import { getServerApi } from "@/lib/serverApi";
import { SettingsForm } from "./settings-form";

export default async function SettingsPage() {
  const api = await getServerApi();
  const queryClient = makeQueryClient();
  await queryClient.prefetchQuery(api.queries.settingsQuery());

  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      <SettingsForm />
    </HydrationBoundary>
  );
}
