import { z } from "zod";

/** Computed by packages/core, never stored — see tripStatus.ts. */
export const TripStatus = z.enum(["dreaming", "planned", "active", "past"]);
export type TripStatus = z.infer<typeof TripStatus>;

export const Leg = z.object({
  id: z.number().int(),
  tripId: z.number().int(),
  sortOrder: z.number().int(),
  city: z.string(),
  startDate: z.string().nullable(), // date-only ISO, e.g. "2026-03-03"
  endDate: z.string().nullable(),
  dayCount: z.number().int().nullable(), // used when dates absent (dreaming trips)
  lodgingPlaceId: z.number().int().nullable(),
  currency: z.string().length(3).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Leg = z.infer<typeof Leg>;

export const Trip = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  name: z.string(),
  heroImageUrl: z.string().nullable(),
  // The trips-list grid's fixed thumbnail — separate from heroImageUrl (the
  // detail page's hero, which re-rolls fresh from Unsplash every visit).
  // Auto-filled once, then stable until the user changes it.
  listImageUrl: z.string().nullable(),
  listImagePhotographerName: z.string().nullable(),
  listImagePhotographerUrl: z.string().nullable(),
  homeCurrency: z.string().length(3).nullable(),
  archivedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  // manual override wins over the computed status when set (see packages/core
  // tripStatus.ts); null means "keep computing it automatically".
  statusOverride: TripStatus.nullable(),
  // at most one trip can be primary at a time (enforced by the API's dedicated
  // /:id/primary endpoint) — the Home page shows this trip first if set.
  isPrimary: z.boolean(),
  // computed, attached by the API at read time — statusOverride ?? computed
  status: TripStatus,
  legs: z.array(Leg),
});
export type Trip = z.infer<typeof Trip>;

export const CreateTripBody = z.object({
  name: z.string().min(1),
  heroImageUrl: z.string().optional(),
  homeCurrency: z.string().length(3).optional(),
});
export type CreateTripBody = z.infer<typeof CreateTripBody>;

export const UpdateTripBody = CreateTripBody.partial().extend({
  statusOverride: TripStatus.nullable().optional(),
  // null clears a custom backdrop, falling back to the auto-fetched Unsplash
  // photo — distinct from omitting the field entirely (no change).
  heroImageUrl: z.string().nullable().optional(),
  listImageUrl: z.string().nullable().optional(),
  listImagePhotographerName: z.string().nullable().optional(),
  listImagePhotographerUrl: z.string().nullable().optional(),
});
export type UpdateTripBody = z.infer<typeof UpdateTripBody>;

// The trips-list card's "pick a photo" grid — the client hands back the
// exact candidate it got from GET /:id/list-image-options, including
// downloadLocation, so the server can ping Unsplash's download endpoint at
// the moment the photo is actually selected (per Unsplash API Guidelines).
export const SelectListImageBody = z.object({
  url: z.string().min(1),
  photographerName: z.string().min(1),
  photographerUrl: z.string().min(1),
  downloadLocation: z.string().min(1),
});
export type SelectListImageBody = z.infer<typeof SelectListImageBody>;

export const CreateLegBody = z.object({
  city: z.string().min(1),
  startDate: z.string().date().optional(),
  endDate: z.string().date().optional(),
  dayCount: z.number().int().positive().optional(),
  lodgingPlaceId: z.number().int().optional(),
  currency: z.string().length(3).optional(),
});
export type CreateLegBody = z.infer<typeof CreateLegBody>;

export const UpdateLegBody = CreateLegBody.partial();
export type UpdateLegBody = z.infer<typeof UpdateLegBody>;

export const ReorderLegsBody = z.object({
  legIdsInOrder: z.array(z.number().int()).min(1),
});
export type ReorderLegsBody = z.infer<typeof ReorderLegsBody>;
