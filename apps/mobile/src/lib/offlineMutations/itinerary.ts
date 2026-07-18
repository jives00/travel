import { useMutation } from "@tanstack/react-query";
import type { ItineraryItem, MoveItemBody, ScheduleItemBody } from "@travel/types";
import { travelApi } from "../api";
import { queryClient } from "../queryClient";
import { nextTempId, registerOfflineMutation, resolveId } from "../mutations";

/** Itinerary scheduling (free-form: legId + scheduledDate + time all optional).
 * Refs (placeId/bookingId/legId/tripId) may be temp ids from offline creates —
 * all resolved on replay. */

export const ITIN_SCHEDULE = ["itinerary", "schedule"] as const;
export const ITIN_MOVE = ["itinerary", "move"] as const;
export const ITIN_UNSCHEDULE = ["itinerary", "unschedule"] as const;

const key = (tripId: number) => ["itinerary", tripId] as const;

function patch(tripId: number, fn: (items: ItineraryItem[]) => ItineraryItem[]) {
  const k = key(resolveId(tripId));
  const prev = queryClient.getQueryData<ItineraryItem[]>(k);
  queryClient.setQueryData<ItineraryItem[]>(k, (old) => fn(old ?? []));
  return prev;
}

export function registerItineraryMutations(): void {
  registerOfflineMutation<{ tripId: number; body: ScheduleItemBody; tempId: number }, ItineraryItem>({
    mutationKey: ITIN_SCHEDULE,
    resolveRefs: (v) => ({
      ...v,
      tripId: resolveId(v.tripId),
      body: {
        ...v.body,
        legId: v.body.legId != null ? resolveId(v.body.legId) : v.body.legId,
        placeId: v.body.placeId != null ? resolveId(v.body.placeId) : v.body.placeId,
        bookingId: v.body.bookingId != null ? resolveId(v.body.bookingId) : v.body.bookingId,
      },
    }),
    mutationFn: ({ tripId, body }) => travelApi.itinerary.schedule(tripId, body),
    tempIdOf: (v) => v.tempId,
    realIdOf: (item) => item.id,
  });

  registerOfflineMutation<{ tripId: number; itemId: number; body: MoveItemBody }, ItineraryItem>({
    mutationKey: ITIN_MOVE,
    resolveRefs: (v) => ({
      tripId: resolveId(v.tripId),
      itemId: resolveId(v.itemId),
      body: { ...v.body, legId: v.body.legId != null ? resolveId(v.body.legId) : v.body.legId },
    }),
    mutationFn: ({ tripId, itemId, body }) => travelApi.itinerary.move(tripId, itemId, body),
  });

  registerOfflineMutation<{ tripId: number; itemId: number }, void>({
    mutationKey: ITIN_UNSCHEDULE,
    resolveRefs: (v) => ({ tripId: resolveId(v.tripId), itemId: resolveId(v.itemId) }),
    mutationFn: ({ tripId, itemId }) => travelApi.itinerary.unschedule(tripId, itemId),
  });
}

const invalidate = (tripId: number) =>
  queryClient.invalidateQueries({ queryKey: ["itinerary", resolveId(tripId)] });

export function useScheduleItem(tripId: number) {
  const m = useMutation<ItineraryItem, Error, { tripId: number; body: ScheduleItemBody; tempId: number }>({
    mutationKey: ITIN_SCHEDULE,
    onMutate: ({ tripId: t, body, tempId }) => {
      const now = new Date().toISOString();
      const optimistic: ItineraryItem = {
        id: tempId,
        tripId: resolveId(t),
        legId: body.legId ?? null,
        dayIndex: null,
        scheduledDate: body.scheduledDate ?? null,
        time: body.time ?? null,
        sortOrder: 9999,
        itemType: body.itemType,
        placeId: body.placeId ?? null,
        bookingId: body.bookingId ?? null,
        activityText: body.activityText ?? null,
        isPrivate: body.isPrivate ?? false,
        createdAt: now,
        updatedAt: now,
      };
      const prev = patch(t, (items) => [...items, optimistic]);
      return { prev, tripId: t };
    },
    onError: (_e, v, ctx) => restore(ctx, v.tripId),
    onSettled: (_d, _e, v) => invalidate(v.tripId),
  });
  return {
    ...m,
    schedule: (body: ScheduleItemBody) => m.mutate({ tripId, body, tempId: nextTempId() }),
  };
}

export function useMoveItem(tripId: number) {
  return useMutation<ItineraryItem, Error, { itemId: number; body: MoveItemBody }>({
    mutationKey: ITIN_MOVE,
    onMutate: ({ itemId, body }) => {
      const prev = patch(tripId, (items) =>
        items.map((i) => (i.id === itemId ? { ...i, ...body, legId: body.legId ?? i.legId } : i)),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => restore(ctx, tripId),
    onSettled: () => invalidate(tripId),
  });
}

export function useUnscheduleItem(tripId: number) {
  return useMutation<void, Error, { itemId: number }>({
    mutationKey: ITIN_UNSCHEDULE,
    onMutate: ({ itemId }) => {
      const prev = patch(tripId, (items) => items.filter((i) => i.id !== itemId));
      return { prev };
    },
    onError: (_e, _v, ctx) => restore(ctx, tripId),
    onSettled: () => invalidate(tripId),
  });
}

function restore(ctx: unknown, tripId: number) {
  const c = ctx as { prev?: ItineraryItem[] } | undefined;
  if (c?.prev) queryClient.setQueryData(key(resolveId(tripId)), c.prev);
}
