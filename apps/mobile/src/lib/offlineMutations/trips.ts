import { useMutation } from "@tanstack/react-query";
import type { CreateLegBody, Leg, Trip, UpdateLegBody, UpdateTripBody } from "@travel/types";
import { computeTripStatus } from "@travel/core";
import { travelApi } from "../api";
import { queryClient } from "../queryClient";
import { nextTempId, registerOfflineMutation, resolveId } from "../mutations";

/**
 * Trip-level writes, offline-capable. Each is registered here (network behavior +
 * optimistic cache update) and exposed as a typed hook. Because they run through
 * the offline registry, editing a trip with the NAS down updates the UI
 * immediately, queues, and replays on reconnect — and an offline-created trip's
 * temp id is remapped to its real id for any follow-up edit.
 */

export const TRIP_CREATE = ["trips", "create"] as const;
export const TRIP_UPDATE = ["trips", "update"] as const;
export const TRIP_SET_PRIMARY = ["trips", "setPrimary"] as const;
export const TRIP_CLEAR_PRIMARY = ["trips", "clearPrimary"] as const;
export const TRIP_ARCHIVE = ["trips", "archive"] as const;
export const LEG_ADD = ["legs", "add"] as const;
export const LEG_UPDATE = ["legs", "update"] as const;
export const LEG_DELETE = ["legs", "delete"] as const;

interface CreateVars {
  name: string;
  tempId: number;
}
interface UpdateVars {
  id: number;
  body: UpdateTripBody;
}

/** Build a plausible optimistic Trip so the list/detail render offline exactly
 * like a real one until the server row arrives. */
function optimisticTrip(name: string, tempId: number): Trip {
  const now = new Date().toISOString();
  return {
    id: tempId,
    userId: 0,
    name,
    heroImageUrl: null,
    listImageUrl: null,
    listImagePhotographerName: null,
    listImagePhotographerUrl: null,
    homeCurrency: null,
    archivedAt: null,
    createdAt: now,
    updatedAt: now,
    statusOverride: null,
    isPrimary: false,
    status: "dreaming",
    legs: [],
  };
}

export function registerTripMutations(): void {
  registerOfflineMutation<CreateVars, Trip>({
    mutationKey: TRIP_CREATE,
    mutationFn: ({ name }) => travelApi.trips.create({ name }),
    tempIdOf: (vars) => vars.tempId,
    realIdOf: (trip) => trip.id,
  });

  registerOfflineMutation<UpdateVars, Trip>({
    mutationKey: TRIP_UPDATE,
    // The id may be a temp id if the trip was created offline moments ago —
    // resolve it to the real server id (known once the create replayed).
    resolveRefs: (vars) => ({ ...vars, id: resolveId(vars.id) }),
    mutationFn: ({ id, body }) => travelApi.trips.update(id, body),
  });

  registerOfflineMutation<{ id: number }, Trip>({
    mutationKey: TRIP_SET_PRIMARY,
    resolveRefs: (vars) => ({ id: resolveId(vars.id) }),
    mutationFn: ({ id }) => travelApi.trips.setPrimary(id),
  });

  registerOfflineMutation<{ id: number }, Trip>({
    mutationKey: TRIP_CLEAR_PRIMARY,
    resolveRefs: (vars) => ({ id: resolveId(vars.id) }),
    mutationFn: ({ id }) => travelApi.trips.clearPrimary(id),
  });

  registerOfflineMutation<{ id: number }, void>({
    mutationKey: TRIP_ARCHIVE,
    resolveRefs: (vars) => ({ id: resolveId(vars.id) }),
    mutationFn: ({ id }) => travelApi.trips.archive(id),
  });

  registerOfflineMutation<{ tripId: number; body: CreateLegBody; tempId: number }, Leg>({
    mutationKey: LEG_ADD,
    resolveRefs: (v) => ({ ...v, tripId: resolveId(v.tripId) }),
    mutationFn: ({ tripId, body }) => travelApi.trips.addLeg(tripId, body),
    tempIdOf: (v) => v.tempId,
    realIdOf: (leg) => leg.id,
  });
  registerOfflineMutation<{ tripId: number; legId: number; body: UpdateLegBody }, Leg>({
    mutationKey: LEG_UPDATE,
    resolveRefs: (v) => ({ ...v, tripId: resolveId(v.tripId), legId: resolveId(v.legId) }),
    mutationFn: ({ tripId, legId, body }) => travelApi.trips.updateLeg(tripId, legId, body),
  });
  registerOfflineMutation<{ tripId: number; legId: number }, void>({
    mutationKey: LEG_DELETE,
    resolveRefs: (v) => ({ tripId: resolveId(v.tripId), legId: resolveId(v.legId) }),
    mutationFn: ({ tripId, legId }) => travelApi.trips.deleteLeg(tripId, legId),
  });
}

const invalidateTrip = (tripId: number) => queryClient.invalidateQueries({ queryKey: ["trips", resolveId(tripId)] });

export function useAddLeg(tripId: number) {
  const m = useMutation<Leg, Error, { tripId: number; body: CreateLegBody; tempId: number }>({
    mutationKey: LEG_ADD,
    onSettled: () => invalidateTrip(tripId),
  });
  return { ...m, add: (body: CreateLegBody) => m.mutate({ tripId, body, tempId: nextTempId() }) };
}

export function useDeleteLeg(tripId: number) {
  return useMutation<void, Error, { legId: number }>({
    mutationKey: LEG_DELETE,
    onMutate: ({ legId }) => {
      const k = ["trips", resolveId(tripId)] as const;
      const prev = queryClient.getQueryData<Trip>(k);
      if (prev) queryClient.setQueryData<Trip>(k, { ...prev, legs: prev.legs.filter((l) => l.id !== legId) });
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      const c = ctx as { prev?: Trip } | undefined;
      if (c?.prev) queryClient.setQueryData(["trips", resolveId(tripId)], c.prev);
    },
    onSettled: () => invalidateTrip(tripId),
  });
}

// ---- hooks (components use these; optimistic updates live in onMutate) -------

export function useCreateTrip() {
  const mutation = useMutation<Trip, Error, CreateVars>({
    mutationKey: TRIP_CREATE,
    onMutate: async ({ name, tempId }) => {
      await queryClient.cancelQueries({ queryKey: ["trips"] });
      const prev = queryClient.getQueryData<Trip[]>(["trips"]);
      queryClient.setQueryData<Trip[]>(["trips"], (old) => [...(old ?? []), optimisticTrip(name, tempId)]);
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      const c = ctx as { prev?: Trip[] } | undefined;
      if (c?.prev) queryClient.setQueryData(["trips"], c.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["trips"] }),
  });
  return {
    ...mutation,
    create: (name: string) => mutation.mutate({ name, tempId: nextTempId() }),
  };
}

export function useUpdateTrip() {
  return useMutation<Trip, Error, UpdateVars>({
    mutationKey: TRIP_UPDATE,
    onMutate: async ({ id, body }) => {
      await queryClient.cancelQueries({ queryKey: ["trips"] });
      const prevList = queryClient.getQueryData<Trip[]>(["trips"]);
      const prevOne = queryClient.getQueryData<Trip>(["trips", id]);
      const patch = (t: Trip): Trip => {
        const merged = { ...t, ...body } as Trip;
        // Keep computed status honest when an override is cleared/changed offline.
        merged.status = merged.statusOverride ?? computeTripStatus(merged);
        return merged;
      };
      queryClient.setQueryData<Trip[]>(["trips"], (old) => old?.map((t) => (t.id === id ? patch(t) : t)));
      if (prevOne) queryClient.setQueryData<Trip>(["trips", id], patch(prevOne));
      return { prevList, prevOne, id };
    },
    onError: (_e, _v, ctx) => {
      const c = ctx as { prevList?: Trip[]; prevOne?: Trip; id?: number } | undefined;
      if (c?.prevList) queryClient.setQueryData(["trips"], c.prevList);
      if (c?.prevOne && c.id != null) queryClient.setQueryData(["trips", c.id], c.prevOne);
    },
    onSettled: (_d, _e, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["trips"] });
      queryClient.invalidateQueries({ queryKey: ["trips", resolveId(id)] });
    },
  });
}

/** Primary toggle + archive — queue-and-replay, optimism kept light (a full
 * cross-trip optimistic primary swap isn't worth the complexity offline). */
export function useSetPrimary() {
  return useMutation<Trip, Error, { id: number }>({
    mutationKey: TRIP_SET_PRIMARY,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["trips"] }),
  });
}

export function useClearPrimary() {
  return useMutation<Trip, Error, { id: number }>({
    mutationKey: TRIP_CLEAR_PRIMARY,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["trips"] }),
  });
}

export function useArchiveTrip() {
  return useMutation<void, Error, { id: number }>({
    mutationKey: TRIP_ARCHIVE,
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["trips"] }),
  });
}
