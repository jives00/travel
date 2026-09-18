import { z } from "zod";

/** Room for a blog post or a video later — see migration 036. */
export const TripLinkKind = z.enum(["photo_album"]);
export type TripLinkKind = z.infer<typeof TripLinkKind>;

/** A link out to something that lives elsewhere — today a photo album.
 *
 * Thumbnails are **uploaded, never fetched**. An `og:image` scrape was built
 * first and removed: it worked for public pages but not for the providers
 * actually in use. A Google Photos share link's preview is public, but a photo
 * address copied out of Google Photos is bound to the viewer's session and 403s
 * everyone else; Synology Photos can't work by link at all, since its thumbnail
 * URLs carry an expiring token and its QuickConnect share page exposes no
 * preview and nothing server-reachable behind it. Keeping a sometimes-working
 * automatic path meant a UI that had to explain when it applied — so the bytes
 * now always come from the one place that can see the photo.
 *
 * Links are also not scoped to a city or an activity any more: a label says
 * what an album is, and that turned out to be all the grouping wanted. The
 * `leg_id` / `itinerary_item_id` columns from 036 are left in place but unused.
 */
export const TripLink = z.object({
  id: z.number().int(),
  tripId: z.number().int(),
  kind: TripLinkKind,
  label: z.string(),
  url: z.string(),
  /** The API's own servable path for the uploaded image
   * (`/api/link-images/…`), or null when none has been uploaded yet. */
  thumbnailUrl: z.string().nullable(),
  /** The stored filename, so the bytes can be replaced or deleted. Clients
   * never need it to display. */
  thumbnailFile: z.string().nullable(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type TripLink = z.infer<typeof TripLink>;

/** Only http(s): this is opened in the user's browser, and a `javascript:` or
 * `data:` URL in a link they'll click later is worth refusing at the door. */
const HttpUrl = z
  .string()
  .max(2048)
  .refine((v) => /^https?:\/\//i.test(v), { message: "must be an http(s) URL" });

export const CreateTripLinkBody = z.object({
  kind: TripLinkKind.optional(),
  label: z.string().min(1).max(255),
  url: HttpUrl,
});
export type CreateTripLinkBody = z.infer<typeof CreateTripLinkBody>;

/** Every field optional and none nullable, so there is no "clear this" path to
 * get wrong. The thumbnail is deliberately absent: it is replaced by uploading
 * to `/links/:id/image`, never by a field on this body. An earlier version let
 * an update carry the thumbnail, and because the edit form couldn't pre-fill an
 * uploaded one it sent `null` on every save — renaming an album silently
 * deleted its picture. */
export const UpdateTripLinkBody = z.object({
  label: z.string().min(1).max(255).optional(),
  url: HttpUrl.optional(),
  sortOrder: z.number().int().optional(),
});
export type UpdateTripLinkBody = z.infer<typeof UpdateTripLinkBody>;
