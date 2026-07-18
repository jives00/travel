import { z } from "zod";

export const ItineraryItemType = z.enum(["place", "booking", "activity"]);
export type ItineraryItemType = z.infer<typeof ItineraryItemType>;

export const ItineraryItem = z.object({
  id: z.number().int(),
  tripId: z.number().int(),
  legId: z.number().int().nullable(), // optional city association
  dayIndex: z.number().int().nullable(), // deprecated — unused by free-form scheduling
  scheduledDate: z.string().nullable(), // real date, directly user-set
  time: z.string().nullable(), // "HH:mm"; null → no time set
  sortOrder: z.number().int(),
  itemType: ItineraryItemType,
  placeId: z.number().int().nullable(),
  bookingId: z.number().int().nullable(),
  activityText: z.string().nullable(),
  isPrivate: z.boolean(),
  completed: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type ItineraryItem = z.infer<typeof ItineraryItem>;

/** Adds a place/free-text idea to the itinerary. A leg (city) association and a
 * real date/time are both optional and independent — no more mandatory leg +
 * relative day-index. Scheduling a place here is what flips its status to
 * `planned` (application-level). */
export const ScheduleItemBody = z
  .object({
    legId: z.number().int().optional(),
    scheduledDate: z.string().optional(),
    time: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    itemType: ItineraryItemType,
    placeId: z.number().int().optional(),
    bookingId: z.number().int().optional(),
    activityText: z.string().max(512).optional(),
    isPrivate: z.boolean().optional(),
  })
  .refine(
    (v) =>
      (v.itemType === "place" && v.placeId != null) ||
      (v.itemType === "booking" && v.bookingId != null) ||
      (v.itemType === "activity" && v.activityText != null),
    { message: "itemType must match the provided reference field" },
  );
export type ScheduleItemBody = z.infer<typeof ScheduleItemBody>;

export const MoveItemBody = z.object({
  legId: z.number().int().nullable().optional(),
  scheduledDate: z.string().nullable().optional(),
  time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  activityText: z.string().max(512).optional(),
  sortOrder: z.number().int().optional(),
  isPrivate: z.boolean().optional(),
  completed: z.boolean().optional(),
});
export type MoveItemBody = z.infer<typeof MoveItemBody>;
