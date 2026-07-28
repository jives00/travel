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

// Not `CreateBookingBody.partial()`: on create, an omitted field and a cleared
// field mean the same thing, but on update they don't. The PATCH route only
// writes keys that are present (`!== undefined`), so a nullable field has to be
// able to carry an explicit `null` — otherwise clearing one (unlinking a place,
// blanking a wrong address) is indistinguishable from leaving it alone, and the
// old value sticks. `type`/`title` stay non-nullable: both columns are NOT NULL.
export const UpdateBookingBody = z.object({
  legId: z.number().int().nullish(),
  type: BookingType.optional(),
  title: z.string().min(1).optional(),
  confirmationCode: z.string().nullish(),
  flightNumber: z.string().nullish(),
  startAt: z.string().nullish(),
  endAt: z.string().nullish(),
  price: z.number().nullish(),
  currency: z.string().length(3).nullish(),
  placeId: z.number().int().nullish(),
  address: z.string().nullish(),
  lat: z.number().nullish(),
  lng: z.number().nullish(),
  notes: z.string().max(2000).nullish(),
  completed: z.boolean().optional(),
});
export type UpdateBookingBody = z.infer<typeof UpdateBookingBody>;
