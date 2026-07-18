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

const invalidate = (tripId: number) => queryClient.invalidateQueries({ queryKey: ["bookings", resolveId(tripId)] });

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
    onSettled: (_d, _e, v) => invalidate(v.tripId),
  });
  return { ...m, update: (bookingId: number, body: UpdateBookingBody) => m.mutate({ tripId, bookingId, body }) };
}

export function useRemoveBooking(tripId: number) {
  return useMutation<void, Error, { bookingId: number }>({
    mutationKey: BOOKING_REMOVE,
    onMutate: ({ bookingId }) => {
      const k = ["bookings", resolveId(tripId)] as const;
      const prev = queryClient.getQueryData<Booking[]>(k);
      queryClient.setQueryData<Booking[]>(k, (old) => old?.filter((b) => b.id !== bookingId));
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      const c = ctx as { prev?: Booking[] } | undefined;
      if (c?.prev) queryClient.setQueryData(["bookings", resolveId(tripId)], c.prev);
    },
    onSettled: () => invalidate(tripId),
  });
}
