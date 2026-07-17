import { queryOptions } from "@tanstack/react-query";
import type { createSettingsEndpoints } from "../endpoints/settings";

export function createSettingsQueries(settings: ReturnType<typeof createSettingsEndpoints>) {
  return {
    settingsQuery: () =>
      queryOptions({
        queryKey: ["settings"] as const,
        queryFn: () => settings.get(),
        staleTime: 5 * 60_000, // settings change rarely
      }),
  };
}
