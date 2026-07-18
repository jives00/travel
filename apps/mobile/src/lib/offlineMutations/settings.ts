import { useMutation } from "@tanstack/react-query";
import type { Settings, UpdateSettingsBody } from "@travel/types";
import { travelApi } from "../api";
import { queryClient } from "../queryClient";
import { registerOfflineMutation } from "../mutations";

export const SETTINGS_UPDATE = ["settings", "update"] as const;

export function registerSettingsMutations(): void {
  registerOfflineMutation<UpdateSettingsBody, Settings>({
    mutationKey: SETTINGS_UPDATE,
    mutationFn: (body) => travelApi.settings.update(body),
  });
}

/** Single-row settings upsert — last-write-wins is fine (single user). Optimistic
 * so toggles feel instant offline; queues and replays like everything else. */
export function useUpdateSettings() {
  return useMutation<Settings, Error, UpdateSettingsBody>({
    mutationKey: SETTINGS_UPDATE,
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: ["settings"] });
      const prev = queryClient.getQueryData<Settings>(["settings"]);
      if (prev) queryClient.setQueryData<Settings>(["settings"], { ...prev, ...body });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      const c = ctx as { prev?: Settings } | undefined;
      if (c?.prev) queryClient.setQueryData(["settings"], c.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["settings"] }),
  });
}
