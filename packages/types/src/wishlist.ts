import { z } from "zod";

export const WishlistLocationType = z.enum(["city", "country"]);
export type WishlistLocationType = z.infer<typeof WishlistLocationType>;

// "visited" covers places you've actually been but don't want a full trip
// record for (no dates/itinerary) — same lightweight pin as "want_to_visit",
// just a different map bucket/color.
export const WishlistStatus = z.enum(["visited", "want_to_visit"]);
export type WishlistStatus = z.infer<typeof WishlistStatus>;

export const WishlistLocation = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  name: z.string(),
  type: WishlistLocationType,
  status: WishlistStatus,
  lat: z.number(),
  lng: z.number(),
  note: z.string().nullable(),
  createdAt: z.string(),
});
export type WishlistLocation = z.infer<typeof WishlistLocation>;

export const CreateWishlistLocationBody = z.object({
  name: z.string().min(1),
  type: WishlistLocationType,
  status: WishlistStatus.default("want_to_visit"),
  lat: z.number(),
  lng: z.number(),
  note: z.string().max(2000).optional(),
});
export type CreateWishlistLocationBody = z.infer<typeof CreateWishlistLocationBody>;
