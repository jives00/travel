import { z } from "zod";
import { WishlistLocation } from "./wishlist";

/** `visited`/`planned` come from real trips (past vs. everything else); `want_to_visit`
 * is the manually-curated wishlist — see packages/core's mapBucketForTripStatus. */
export const MapBucket = z.enum(["visited", "planned", "want_to_visit"]);
export type MapBucket = z.infer<typeof MapBucket>;

export const MapCityPointKind = z.enum(["leg", "day_trip"]);
export type MapCityPointKind = z.infer<typeof MapCityPointKind>;

/** A city-level pin derived from trip data — either a leg's base city, or a
 * `day_trip`-tagged place visited/planned outside that leg's city (e.g. Sitges
 * as a day trip from Barcelona). */
export const MapCityPoint = z.object({
  id: z.string(),
  name: z.string(),
  lat: z.number(),
  lng: z.number(),
  kind: MapCityPointKind,
  tripId: z.number().int(),
  tripName: z.string(),
  bucket: z.enum(["visited", "planned"]),
});
export type MapCityPoint = z.infer<typeof MapCityPoint>;

export const MapOverview = z.object({
  visited: z.array(MapCityPoint),
  planned: z.array(MapCityPoint),
  wantToVisit: z.array(WishlistLocation),
});
export type MapOverview = z.infer<typeof MapOverview>;
