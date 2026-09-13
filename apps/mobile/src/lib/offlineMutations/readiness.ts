import { useMutation } from "@tanstack/react-query";
import type { ReadinessDismissal } from "@travel/types";
import { travelApi } from "../api";
import { queryClient } from "../queryClient";
import { registerOfflineMutation, resolveId } from "../mutations";

export const READINESS_DISMISS = ["readiness", "dismiss"] as const;
export const READINESS_RESTORE = ["readiness", "restore"] as const;

export interface ReadinessDismissVars {
  tripId: number;
  keys: string[];
}

export function registerReadinessMutations(): void {
  // Both writes are idempotent server-side, which is what makes them safe to
  // replay after a cold start — a key already dismissed (or already gone) is a
  // no-op rather than an error.
  registerOfflineMutation<ReadinessDismissVars, ReadinessDismissal[]>({
    mutationKey: READINESS_DISMISS,
    mutationFn: ({ tripId, keys }) => travelApi.readiness.dismiss(tripId, keys),
    resolveRefs: (vars) => ({ ...vars, tripId: resolveId(vars.tripId) }),
  });
  registerOfflineMutation<ReadinessDismissVars, ReadinessDismissal[]>({
    mutationKey: READINESS_RESTORE,
    mutationFn: ({ tripId, keys }) => travelApi.readiness.restore(tripId, keys),
    resolveRefs: (vars) => ({ ...vars, tripId: resolveId(vars.tripId) }),
  });
}

function useDismissalWrite(tripId: number, mutationKey: readonly string[], dismissing: boolean) {
  const queryKey = ["readinessDismissals", tripId] as const;
  return useMutation<ReadinessDismissal[], Error, ReadinessDismissVars>({
    mutationKey,
    mutationFn: ({ tripId: id, keys }) =>
      dismissing ? travelApi.readiness.dismiss(id, keys) : travelApi.readiness.restore(id, keys),
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<ReadinessDismissal[]>(queryKey);
      const keys = new Set(vars.keys);
      const now = new Date().toISOString();
      queryClient.setQueryData<ReadinessDismissal[]>(
        queryKey,
        dismissing
          ? [
              ...(prev ?? []).filter((d) => !keys.has(d.key)),
              ...vars.keys.map((key) => ({ tripId, key, dismissedAt: now })),
            ]
          : (prev ?? []).filter((d) => !keys.has(d.key)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      const c = ctx as { prev?: ReadinessDismissal[] } | undefined;
      if (c?.prev) queryClient.setQueryData(queryKey, c.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}

/** Silences the readiness nudges for the given subject keys. */
export function useDismissReadiness(tripId: number) {
  return useDismissalWrite(tripId, READINESS_DISMISS, true);
}

/** Undo — brings dismissed nudges back. */
export function useRestoreReadiness(tripId: number) {
  return useDismissalWrite(tripId, READINESS_RESTORE, false);
}
