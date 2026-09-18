import { useMutation } from "@tanstack/react-query";
import type { CreateTripLinkBody, TripLink, UpdateTripLinkBody } from "@travel/types";
import { travelApi } from "../api";
import { queryClient } from "../queryClient";
import { nextTempId, registerOfflineMutation, resolveId } from "../mutations";

export const TRIP_LINK_CREATE = ["tripLinks", "create"] as const;
export const TRIP_LINK_UPDATE = ["tripLinks", "update"] as const;
export const TRIP_LINK_REMOVE = ["tripLinks", "remove"] as const;

export interface CreateTripLinkVars extends CreateTripLinkBody {
  tripId: number;
  tempId: number;
}

export function registerTripLinkMutations(): void {
  registerOfflineMutation<CreateTripLinkVars, TripLink>({
    mutationKey: TRIP_LINK_CREATE,
    mutationFn: ({ tripId, tempId: _t, ...body }) => travelApi.tripLinks.create(tripId, body),
    // A link added offline can belong to a trip that was itself created
    // offline, so its temp id has to be resolved before the request goes out.
    resolveRefs: (v) => ({ ...v, tripId: resolveId(v.tripId) }),
    tempIdOf: (v) => v.tempId,
    realIdOf: (l) => l.id,
  });
  registerOfflineMutation<{ tripId: number; id: number; body: UpdateTripLinkBody }, TripLink>({
    mutationKey: TRIP_LINK_UPDATE,
    mutationFn: ({ tripId, id, body }) => travelApi.tripLinks.update(tripId, id, body),
    resolveRefs: (v) => ({ ...v, tripId: resolveId(v.tripId), id: resolveId(v.id) }),
  });
  registerOfflineMutation<{ tripId: number; id: number }, void>({
    mutationKey: TRIP_LINK_REMOVE,
    mutationFn: ({ tripId, id }) => travelApi.tripLinks.remove(tripId, id),
    resolveRefs: (v) => ({ tripId: resolveId(v.tripId), id: resolveId(v.id) }),
  });
}

function keyFor(tripId: number) {
  return ["tripLinks", tripId] as const;
}

export function useCreateTripLink(tripId: number) {
  const queryKey = keyFor(tripId);
  const m = useMutation<TripLink, Error, CreateTripLinkVars>({
    mutationKey: TRIP_LINK_CREATE,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<TripLink[]>(queryKey);
      const now = new Date().toISOString();
      // No optimistic thumbnail: the bytes live on the server and are uploaded
      // from the web app, so a link created here shows the placeholder until
      // one is added.
      queryClient.setQueryData<TripLink[]>(queryKey, [
        ...(prev ?? []),
        {
          id: vars.tempId,
          tripId,
          kind: vars.kind ?? "photo_album",
          label: vars.label,
          url: vars.url,
          thumbnailUrl: null,
          thumbnailFile: null,
          sortOrder: prev?.length ?? 0,
          createdAt: now,
          updatedAt: now,
        },
      ]);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      const c = ctx as { prev?: TripLink[] } | undefined;
      if (c?.prev) queryClient.setQueryData(queryKey, c.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
  return {
    ...m,
    create: (body: CreateTripLinkBody) => m.mutate({ ...body, tripId, tempId: nextTempId() }),
  };
}

export function useUpdateTripLink(tripId: number) {
  const queryKey = keyFor(tripId);
  return useMutation<TripLink, Error, { tripId: number; id: number; body: UpdateTripLinkBody }>({
    mutationKey: TRIP_LINK_UPDATE,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<TripLink[]>(queryKey);
      queryClient.setQueryData<TripLink[]>(
        queryKey,
        (prev ?? []).map((l) =>
          l.id === vars.id
            ? { ...l, label: vars.body.label ?? l.label, url: vars.body.url ?? l.url }
            : l,
        ),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      const c = ctx as { prev?: TripLink[] } | undefined;
      if (c?.prev) queryClient.setQueryData(queryKey, c.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}

export function useRemoveTripLink(tripId: number) {
  const queryKey = keyFor(tripId);
  return useMutation<void, Error, { tripId: number; id: number }>({
    mutationKey: TRIP_LINK_REMOVE,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<TripLink[]>(queryKey);
      queryClient.setQueryData<TripLink[]>(queryKey, (prev ?? []).filter((l) => l.id !== vars.id));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      const c = ctx as { prev?: TripLink[] } | undefined;
      if (c?.prev) queryClient.setQueryData(queryKey, c.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}

