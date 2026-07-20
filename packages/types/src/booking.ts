import { z } from "zod";

export const BookingType = z.enum(["flight", "hotel", "train", "car", "restaurant", "event", "activity"]);
export type BookingType = z.infer<typeof BookingType>;

export const Booking = z.object({
  id: z.number().int(),
  tripId: z.number().int(),
  legId: z.number().int().nullable(),
  type: BookingType,
  title: z.string(),
  confirmationCode: z.string().nullable(),
  flightNumber: z.string().nullable(),
  startAt: z.string().nullable(), // ISO datetime
  endAt: z.string().nullable(),
  price: z.number().nullable(),
  currency: z.string().length(3).nullable(),
  placeId: z.number().int().nullable(),
  // A booking's own location, independent of `placeId` — no library Place
  // record required just to plot something like a hotel on the map.
  address: z.string().nullable(),
  lat: z.number().nullable(),
  lng: z.number().nullable(),
  notes: z.string().nullable(),
  // Bookings never get their own itinerary_item (see bookings.routes.ts), so
  // this is a separate column rather than reusing itinerary_items.completed.
  completed: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Booking = z.infer<typeof Booking>;

export const CreateBookingBody = z.object({
  legId: z.number().int().optional(),
  type: BookingType,
  title: z.string().min(1),
  confirmationCode: z.string().optional(),
  flightNumber: z.string().optional(),
  startAt: z.string().optional(),
  endAt: z.string().optional(),
  price: z.number().optional(),
  currency: z.string().length(3).optional(),
  placeId: z.number().int().optional(),
  address: z.string().optional(),
  lat: z.number().optional(),
  lng: z.number().optional(),
  notes: z.string().max(2000).optional(),
  completed: z.boolean().optional(),
});
export type CreateBookingBody = z.infer<typeof CreateBookingBody>;

export const UpdateBookingBody = CreateBookingBody.partial();
export type UpdateBookingBody = z.infer<typeof UpdateBookingBody>;
