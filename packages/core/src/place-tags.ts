import type { EnumEntry } from "./enums";

/** Curated, closed set of place tags. Every place has one required "primary"
 * tag — the headline label shown everywhere (Site, Activity, Food & Drinks,
 * etc). Deliberately separate from `googleTypes` (raw, uncurated Google
 * passthrough): this list stays small, travel-relevant, and stable
 * regardless of what Google's taxonomy does. */
export const PLACE_TAGS: EnumEntry[] = [
  // Label/icon deliberately match BOOKING_TYPES' "activity" entry — same
  // pin color group too (BOOKING_TYPE_TO_MAP_PIN_GROUP in enums.ts).
  { key: "activity", label: "Tour / Activity", iconName: "hiking" },
  { key: "day_trip", label: "Day Trip", iconName: "explore" },
  { key: "food_drinks", label: "Food & Drinks", iconName: "restaurant" },
  { key: "lodging", label: "Lodging", iconName: "hotel" },
  { key: "other", label: "Other", iconName: "place" },
  { key: "shopping", label: "Shopping", iconName: "storefront" },
  { key: "site", label: "Site", iconName: "museum" },
  { key: "transit", label: "Transit", iconName: "directions_transit" },
];

export const PLACE_TAG_KEYS = PLACE_TAGS.map((t) => t.key);

/** Map-pin group is just the tag itself now that there are only 8 of
 * them — kept as a function (rather than inlining `place.primaryTag ??
 * "other"` at every call site) so the map-pin coloring call sites don't need
 * to special-case null primaryTag themselves. */
export function mapPinGroupForTag(tag: string | null | undefined): string {
  return tag ?? "other";
}

// Best-effort mapping from Google's raw `types[]` (Places API (New) taxonomy)
// onto our curated tags — only used to pre-fill suggestions on the add-place
// preview screen; the user reviews/edits before saving, so misses here are
// low-stakes.
const GOOGLE_TYPE_TO_TAG: Record<string, string> = {
  neighborhood: "site",
  sublocality: "site",
  sublocality_level_1: "site",
  locality: "site",
  beach: "activity",
  park: "activity",
  garden: "activity",
  hiking_area: "activity",
  national_park: "activity",
  natural_feature: "site",
  scenic_lookout: "site",
  marina: "activity",
  church: "site",
  place_of_worship: "site",
  hindu_temple: "site",
  mosque: "site",
  synagogue: "site",
  museum: "site",
  art_gallery: "site",
  historical_landmark: "site",
  historical_place: "site",
  monument: "site",
  tourist_attraction: "site",
  restaurant: "food_drinks",
  meal_takeaway: "food_drinks",
  meal_delivery: "food_drinks",
  cafe: "food_drinks",
  coffee_shop: "food_drinks",
  bakery: "food_drinks",
  bar: "food_drinks",
  pub: "food_drinks",
  brewery: "food_drinks",
  winery: "food_drinks",
  market: "shopping",
  farmers_market: "shopping",
  shopping_mall: "shopping",
  night_club: "activity",
  performing_arts_theater: "activity",
  concert_hall: "activity",
  movie_theater: "activity",
  train_station: "transit",
  subway_station: "transit",
  light_rail_station: "transit",
  transit_station: "transit",
  airport: "transit",
  international_airport: "transit",
  bus_station: "transit",
  ferry_terminal: "transit",
  stadium: "activity",
  arena: "activity",
  zoo: "activity",
  aquarium: "activity",
  spa: "activity",
  lodging: "lodging",
  hotel: "lodging",
};

export function suggestTagsFromGoogleTypes(googleTypes: string[] | null | undefined): string[] {
  if (!googleTypes) return [];
  const tags = new Set<string>();
  for (const t of googleTypes) {
    const tag = GOOGLE_TYPE_TO_TAG[t];
    if (tag) tags.add(tag);
  }
  return [...tags];
}

// When several of a place's Google types map to different tags, prefer the
// most specific/distinctive match — most generic ("activity") goes last so
// it only wins when nothing sharper matched.
const TAG_PRIORITY = ["transit", "lodging", "site", "food_drinks", "shopping", "activity"];

export function suggestPrimaryTagFromGoogleTypes(googleTypes: string[] | null | undefined): string | undefined {
  const candidates = new Set(suggestTagsFromGoogleTypes(googleTypes));
  if (candidates.size === 0) return undefined;
  for (const tag of TAG_PRIORITY) {
    if (candidates.has(tag)) return tag;
  }
  return candidates.values().next().value;
}
