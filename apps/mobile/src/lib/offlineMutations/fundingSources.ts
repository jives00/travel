import { useMutation } from "@tanstack/react-query";
import type { CreateFundingSourceBody, FundingSource, UpdateFundingSourceBody } from "@travel/types";
import { travelApi } from "../api";
import { queryClient } from "../queryClient";
import { nextTempId, registerOfflineMutation, resolveId } from "../mutations";

export const FUNDING_SOURCE_CREATE = ["fundingSources", "create"] as const;
export const FUNDING_SOURCE_UPDATE = ["fundingSources", "update"] as const;
export const FUNDING_SOURCE_REMOVE = ["fundingSources", "remove"] as const;

const QUERY_KEY = ["fundingSources"] as const;

export function registerFundingSourceMutations(): void {
  // A source created offline gets a temp id that budget lines may already
  // reference by the time it syncs, which is what tempIdOf/realIdOf repair —
  // the same pattern places and bookings use.
  registerOfflineMutation<{ body: CreateFundingSourceBody; tempId: number }, FundingSource>({
    mutationKey: FUNDING_SOURCE_CREATE,
    mutationFn: ({ body }) => travelApi.fundingSources.create(body),
    tempIdOf: (v) => v.tempId,
    realIdOf: (f) => f.id,
  });
  registerOfflineMutation<{ id: number; body: UpdateFundingSourceBody }, FundingSource>({
    mutationKey: FUNDING_SOURCE_UPDATE,
    resolveRefs: (v) => ({ ...v, id: resolveId(v.id) }),
    mutationFn: ({ id, body }) => travelApi.fundingSources.update(id, body),
  });
  registerOfflineMutation<{ id: number }, void>({
    mutationKey: FUNDING_SOURCE_REMOVE,
    resolveRefs: (v) => ({ id: resolveId(v.id) }),
    mutationFn: ({ id }) => travelApi.fundingSources.remove(id),
  });
}

function invalidate(): void {
  void queryClient.invalidateQueries({ queryKey: QUERY_KEY });
}

export function useCreateFundingSource() {
  const m = useMutation<FundingSource, Error, { body: CreateFundingSourceBody; tempId: number }>({
    mutationKey: FUNDING_SOURCE_CREATE,
    // Show it in every picker immediately — offline, the queued create is the
    // only thing that will ever produce the real row.
    onMutate: ({ body, tempId }) => {
      const prev = queryClient.getQueryData<FundingSource[]>(QUERY_KEY);
      const now = new Date().toISOString();
      queryClient.setQueryData<FundingSource[]>(QUERY_KEY, [
        ...(prev ?? []),
        { id: tempId, name: body.name, sortOrder: (prev?.length ?? 0), createdAt: now, updatedAt: now },
      ]);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      const c = ctx as { prev?: FundingSource[] } | undefined;
      if (c?.prev) queryClient.setQueryData(QUERY_KEY, c.prev);
    },
    onSettled: invalidate,
  });
  return { ...m, create: (name: string) => m.mutate({ body: { name }, tempId: nextTempId() }) };
}

export function useUpdateFundingSource() {
  const m = useMutation<FundingSource, Error, { id: number; body: UpdateFundingSourceBody }>({
    mutationKey: FUNDING_SOURCE_UPDATE,
    onMutate: ({ id, body }) => {
      const prev = queryClient.getQueryData<FundingSource[]>(QUERY_KEY);
      if (prev) queryClient.setQueryData<FundingSource[]>(QUERY_KEY, prev.map((f) => (f.id === id ? { ...f, ...body } : f)));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      const c = ctx as { prev?: FundingSource[] } | undefined;
      if (c?.prev) queryClient.setQueryData(QUERY_KEY, c.prev);
    },
    onSettled: invalidate,
  });
  return { ...m, rename: (id: number, name: string) => m.mutate({ id, body: { name } }) };
}

export function useRemoveFundingSource() {
  const m = useMutation<void, Error, { id: number }>({
    mutationKey: FUNDING_SOURCE_REMOVE,
    onMutate: ({ id }) => {
      const prev = queryClient.getQueryData<FundingSource[]>(QUERY_KEY);
      if (prev) queryClient.setQueryData<FundingSource[]>(QUERY_KEY, prev.filter((f) => f.id !== id));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      const c = ctx as { prev?: FundingSource[] } | undefined;
      if (c?.prev) queryClient.setQueryData(QUERY_KEY, c.prev);
    },
    onSettled: invalidate,
  });
  return { ...m, remove: (id: number) => m.mutate({ id }) };
}
