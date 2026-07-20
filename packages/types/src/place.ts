import { z } from "zod";

export const PlaceStatus = z.enum(["idea", "planned", "visited"]);
export type PlaceStatus = z.infer<typeof PlaceStatus>;

// Curated, closed set of place tags — a place's single `primaryTag` is drawn
// from this set. Keep in sync with packages/core's PLACE_TAGS (the source of
// truth for label/icon; this is just the value set).
export const PlaceTag = z.enum([
  "activity",
  "day_trip",
  "food_drinks",
  "lodging",
  "other",
  "shopping",
  "site",
  "transit",
]);
export type PlaceTag = z.infer<typeof PlaceTag>;

export const PlaceHours = z.record(z.string(), z.string()).nullable();

export const Place = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  googlePlaceId: z.string().nullable(),
  name: z.string(),
  // The headline classification shown everywhere.
  primaryTag: PlaceTag,
  status: PlaceStatus,
  address: z.string().nullable(),
  lat: z.number(),
  lng: z.number(),
  hours: PlaceHours,
  heroPhotoUrl: z.string().nullable(),
  // Widened Google Places Details fields — see google-places.client.ts for why
  // aggregate rating/count is stored but individual review text is not.
  description: z.string().nullable(),
  rating: z.number().nullable(),
  userRatingsTotal: z.number().int().nullable(),
  website: z.string().nullable(),
  googleTypes: z.array(z.string()).nullable(),
  note: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Place = z.infer<typeof Place>;

export const CreatePlaceBody = z.object({
  googlePlaceId: z.string().optional(),
  name: z.string().min(1),
  primaryTag: PlaceTag,
  address: z.string().optional(),
  lat: z.number(),
  lng: z.number(),
  hours: PlaceHours.optional(),
  heroPhotoUrl: z.string().optional(),
  description: z.string().optional(),
  rating: z.number().optional(),
  userRatingsTotal: z.number().int().optional(),
  website: z.string().optional(),
  googleTypes: z.array(z.string()).optional(),
  note: z.string().max(2000).optional(),
  // if provided, links the place onto this trip's ideas tray immediately
  tripId: z.number().int().optional(),
});
export type CreatePlaceBody = z.infer<typeof CreatePlaceBody>;

export const UpdatePlaceBody = CreatePlaceBody.partial().extend({
  status: PlaceStatus.optional(),
});
export type UpdatePlaceBody = z.infer<typeof UpdatePlaceBody>;

export const PlaceListQuery = z.object({
  tripId: z.coerce.number().int().optional(),
  status: PlaceStatus.optional(),
  listId: z.coerce.number().int().optional(),
  q: z.string().optional(),
});
export type PlaceListQuery = z.infer<typeof PlaceListQuery>;

/** Returned when a create/autocomplete pick matches an existing library place by googlePlaceId. */
export interface PlaceDuplicateMatch {
  duplicate: true;
  existing: Place;
}
