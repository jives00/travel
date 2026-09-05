import { useMutation } from "@tanstack/react-query";
import type { Booking, CreateBookingBody, UpdateBookingBody } from "@travel/types";
import { travelApi } from "../api";
import { queryClient } from "../queryClient";
import { nextTempId, registerOfflineMutation, resolveId } from "../mutations";

export const BOOKING_CREATE = ["bookings", "create"] as const;
export const BOOKING_UPDATE = ["bookings", "update"] as const;
export const BOOKING_REMOVE = ["bookings", "remove"] as const;

export function registerBookingMutations(): void {
  registerOfflineMutation<{ tripId: number; body: CreateBookingBody; tempId: number }, Booking>({
    mutationKey: BOOKING_CREATE,
    resolveRefs: (v) => ({
      ...v,
      tripId: resolveId(v.tripId),
      body: { ...v.body, legId: v.body.legId != null ? resolveId(v.body.legId) : v.body.legId },
    }),
    mutationFn: ({ tripId, body }) => travelApi.bookings.create(tripId, body),
    tempIdOf: (v) => v.tempId,
    realIdOf: (b) => b.id,
  });
  registerOfflineMutation<{ tripId: number; bookingId: number; body: UpdateBookingBody }, Booking>({
    mutationKey: BOOKING_UPDATE,
    resolveRefs: (v) => ({ ...v, tripId: resolveId(v.tripId), bookingId: resolveId(v.bookingId) }),
    mutationFn: ({ tripId, bookingId, body }) => travelApi.bookings.update(tripId, bookingId, body),
  });
  registerOfflineMutation<{ tripId: number; bookingId: number }, void>({
    mutationKey: BOOKING_REMOVE,
    resolveRefs: (v) => ({ tripId: resolveId(v.tripId), bookingId: resolveId(v.bookingId) }),
    mutationFn: ({ tripId, bookingId }) => travelApi.bookings.remove(tripId, bookingId),
  });
}

const key = (tripId: number) => ["bookings", resolveId(tripId)] as const;

const invalidate = (tripId: number) => queryClient.invalidateQueries({ queryKey: key(tripId) });

/** Stop any GET that's already in flight before writing an optimistic value.
 * A fetch started *before* the write resolves *after* it and would otherwise
 * write pre-write rows over the optimistic ones — the "it ticks, then flips
 * back a few seconds later" bug. react-query dedupes, so the invalidate in
 * onSettled would reuse that same stale fetch rather than correcting it. */
const cancel = (tripId: number) => queryClient.cancelQueries({ queryKey: key(tripId) });

function restoreBookings(ctx: unknown, tripId: number) {
  const c = ctx as { prev?: Booking[] } | undefined;
  if (c?.prev) queryClient.setQueryData(key(tripId), c.prev);
}

export function useCreateBooking(tripId: number) {
  const m = useMutation<Booking, Error, { tripId: number; body: CreateBookingBody; tempId: number }>({
    mutationKey: BOOKING_CREATE,
    onSettled: (_d, _e, v) => invalidate(v.tripId),
  });
  return { ...m, create: (body: CreateBookingBody) => m.mutate({ tripId, body, tempId: nextTempId() }) };
}

export function useUpdateBooking(tripId: number) {
  const m = useMutation<Booking, Error, { tripId: number; bookingId: number; body: UpdateBookingBody }>({
    mutationKey: BOOKING_UPDATE,
    // Optimistic so a check-off (and any other edit) shows on the tap rather
    // than on the refetch — and so it still shows while the edit sits queued
    // offline. The body's keys are a subset of Booking's, and a cleared field
    // arrives as an explicit null, so a shallow merge is the whole update.
    onMutate: async ({ tripId: t, bookingId, body }) => {
      await cancel(t);
      const prev = queryClient.getQueryData<Booking[]>(key(t));
      queryClient.setQueryData<Booking[]>(key(t), (old) =>
        old?.map((b) => (b.id === bookingId ? { ...b, ...body } : b)),
      );
      return { prev };
    },
    onError: (_e, v, ctx) => restoreBookings(ctx, v.tripId),
    onSettled: (_d, _e, v) => invalidate(v.tripId),
  });
  return { ...m, update: (bookingId: number, body: UpdateBookingBody) => m.mutate({ tripId, bookingId, body }) };
}

export function useRemoveBooking(tripId: number) {
  return useMutation<void, Error, { bookingId: number }>({
    mutationKey: BOOKING_REMOVE,
    onMutate: async ({ bookingId }) => {
      await cancel(tripId);
      const prev = queryClient.getQueryData<Booking[]>(key(tripId));
      queryClient.setQueryData<Booking[]>(key(tripId), (old) => old?.filter((b) => b.id !== bookingId));
      return { prev };
    },
    onError: (_e, _v, ctx) => restoreBookings(ctx, tripId),
    onSettled: () => invalidate(tripId),
  });
}
