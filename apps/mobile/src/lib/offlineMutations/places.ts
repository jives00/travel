import { useMutation } from "@tanstack/react-query";
import type { CreatePlaceBody, Place, PlaceDuplicateMatch, UpdatePlaceBody } from "@travel/types";
import { travelApi } from "../api";
import { queryClient } from "../queryClient";
import { registerOfflineMutation, resolveId } from "../mutations";

/**
 * Place library writes. Note the offline caveat (see §1a): live Google *search*
 * is proxied through the NAS, so it's unavailable offline — but manual-entry
 * creates (name + coords) work fully offline and queue like everything else.
 * A create can return a duplicate match instead of a new row; realIdOf handles both.
 */

export const PLACE_CREATE = ["places", "create"] as const;
export const PLACE_UPDATE = ["places", "update"] as const;
export const PLACE_REMOVE = ["places", "remove"] as const;
export const PLACE_ADD_TO_TRIP = ["places", "addToTrip"] as const;
export const PLACE_REMOVE_FROM_TRIP = ["places", "removeFromTrip"] as const;

type CreateResult = Place | PlaceDuplicateMatch;
function isDuplicate(r: CreateResult): r is PlaceDuplicateMatch {
  return (r as PlaceDuplicateMatch).duplicate === true;
}

export function registerPlaceMutations(): void {
  registerOfflineMutation<CreatePlaceBody & { tempId: number }, CreateResult>({
    mutationKey: PLACE_CREATE,
    resolveRefs: (v) => (v.tripId != null ? { ...v, tripId: resolveId(v.tripId) } : v),
    mutationFn: ({ tempId: _t, ...body }) => travelApi.places.create(body),
    tempIdOf: (v) => v.tempId,
    realIdOf: (r) => (isDuplicate(r) ? r.existing.id : r.id),
  });
  registerOfflineMutation<{ id: number; body: UpdatePlaceBody }, Place>({
    mutationKey: PLACE_UPDATE,
    resolveRefs: (v) => ({ ...v, id: resolveId(v.id) }),
    mutationFn: ({ id, body }) => travelApi.places.update(id, body),
  });
  registerOfflineMutation<{ id: number }, void>({
    mutationKey: PLACE_REMOVE,
    resolveRefs: (v) => ({ id: resolveId(v.id) }),
    mutationFn: ({ id }) => travelApi.places.remove(id),
  });
  registerOfflineMutation<{ id: number; tripId: number }, void>({
    mutationKey: PLACE_ADD_TO_TRIP,
    resolveRefs: (v) => ({ id: resolveId(v.id), tripId: resolveId(v.tripId) }),
    mutationFn: ({ id, tripId }) => travelApi.places.addToTrip(id, tripId),
  });
  registerOfflineMutation<{ id: number; tripId: number }, void>({
    mutationKey: PLACE_REMOVE_FROM_TRIP,
    resolveRefs: (v) => ({ id: resolveId(v.id), tripId: resolveId(v.tripId) }),
    mutationFn: ({ id, tripId }) => travelApi.places.removeFromTrip(id, tripId),
  });
}

const invalidate = () => queryClient.invalidateQueries({ queryKey: ["places"] });

export function useUpdatePlace() {
  return useMutation<Place, Error, { id: number; body: UpdatePlaceBody }>({
    mutationKey: PLACE_UPDATE,
    onSettled: invalidate,
  });
}

export function useRemovePlace() {
  return useMutation<void, Error, { id: number }>({ mutationKey: PLACE_REMOVE, onSettled: invalidate });
}

export function useAddPlaceToTrip() {
  return useMutation<void, Error, { id: number; tripId: number }>({
    mutationKey: PLACE_ADD_TO_TRIP,
    onSettled: invalidate,
  });
}
