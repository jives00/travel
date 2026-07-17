import type { EnumEntry } from "./enums";

/** Curated, closed set of specific place tags. One is the place's required
 * "primary" tag (the headline label shown everywhere — Church, Beach, Museum,
 * etc.); any others are additional tags. Deliberately separate from
 * `googleTypes` (raw, uncurated Google passthrough): this list stays small,
 * travel-relevant, and stable regardless of what Google's taxonomy does. */
export const PLACE_TAGS: EnumEntry[] = [
  { key: "neighborhood", label: "Neighborhood", iconName: "location_city" },
  { key: "day_trip", label: "Day Trip", iconName: "explore" },
  { key: "beach", label: "Beach", iconName: "beach_access" },
  { key: "park", label: "Park", iconName: "park" },
  { key: "garden", label: "Garden", iconName: "local_florist" },
  { key: "hiking_trail", label: "Hiking/Trail", iconName: "hiking" },
  { key: "viewpoint", label: "Viewpoint", iconName: "landscape" },
  { key: "waterfront", label: "Waterfront", iconName: "water" },
  { key: "church", label: "Church", iconName: "church" },
  { key: "museum", label: "Museum", iconName: "museum" },
  { key: "architecture", label: "Architecture", iconName: "account_balance" },
  { key: "historic_site", label: "Historic Site", iconName: "history_edu" },
  { key: "landmark", label: "Landmark", iconName: "flag" },
  { key: "restaurant", label: "Restaurant", iconName: "restaurant" },
  { key: "cafe", label: "Cafe", iconName: "local_cafe" },
  { key: "bar", label: "Bar", iconName: "local_bar" },
  { key: "brewery_winery", label: "Brewery/Winery", iconName: "sports_bar" },
  { key: "market", label: "Market", iconName: "storefront" },
  { key: "nightlife", label: "Nightlife", iconName: "nightlife" },
  { key: "live_music_theater", label: "Live Music/Theater", iconName: "theater_comedy" },
  { key: "train_station", label: "Train Station", iconName: "train" },
  { key: "airport", label: "Airport", iconName: "flight" },
  { key: "bus_ferry_station", label: "Bus/Ferry Station", iconName: "directions_boat" },
  { key: "stadium_venue", label: "Stadium/Venue", iconName: "stadium" },
  { key: "zoo_aquarium", label: "Zoo/Aquarium", iconName: "pets" },
  { key: "spa", label: "Spa", iconName: "spa" },
];

export const PLACE_TAG_KEYS = PLACE_TAGS.map((t) => t.key);

// The old coarse `category` enum (food/sight/activity/lodging/transit/
// shopping/other) still exists in the DB purely as an internal grouping for
// budget rollups — it's never chosen by the user directly anymore, just
// derived from whichever tag they pick as primary. Map-pin coloring uses the
// separate, purpose-built grouping below instead (see MAP_PIN_COLORS).
const TAG_TO_CATEGORY: Record<string, string> = {
  neighborhood: "sight",
  day_trip: "activity",
  beach: "activity",
  park: "activity",
  garden: "activity",
  hiking_trail: "activity",
  viewpoint: "sight",
  waterfront: "activity",
  church: "sight",
  museum: "sight",
  architecture: "sight",
  historic_site: "sight",
  landmark: "sight",
  restaurant: "food",
  cafe: "food",
  bar: "food",
  brewery_winery: "food",
  market: "shopping",
  nightlife: "activity",
  live_music_theater: "activity",
  train_station: "transit",
  airport: "transit",
  bus_ferry_station: "transit",
  stadium_venue: "activity",
  zoo_aquarium: "activity",
  spa: "activity",
};

// Map-pin color grouping — coarser than the 24 tags (24 distinct dot colors
// wouldn't read on a map) but finer than the old 7-value category (which
// lumped Beach in with Nightlife and Stadiums under "activity"). Matches the
// group keys in packages/ui-tokens' MAP_PIN_COLORS.
const TAG_TO_MAP_PIN_GROUP: Record<string, string> = {
  neighborhood: "sights",
  day_trip: "nature",
  beach: "nature",
  park: "nature",
  garden: "nature",
  hiking_trail: "nature",
  viewpoint: "nature",
  waterfront: "nature",
  church: "sights",
  museum: "sights",
  architecture: "sights",
  historic_site: "sights",
  landmark: "sights",
  restaurant: "food",
  cafe: "food",
  bar: "food",
  brewery_winery: "food",
  market: "shopping",
  nightlife: "nightlife",
  live_music_theater: "nightlife",
  stadium_venue: "nightlife",
  train_station: "transit",
  airport: "transit",
  bus_ferry_station: "transit",
  zoo_aquarium: "wellness",
  spa: "wellness",
};

export function mapPinGroupForTag(tag: string | null | undefined): string {
  if (!tag) return "other";
  return TAG_TO_MAP_PIN_GROUP[tag] ?? "other";
}

export function categoryForTag(tag: string | null | undefined): string {
  if (!tag) return "other";
  return TAG_TO_CATEGORY[tag] ?? "other";
}

// Best-effort mapping from Google's raw `types[]` (Places API (New) taxonomy)
// onto our curated tags — only used to pre-fill suggestions on the add-place
// preview screen; the user reviews/edits before saving, so misses here are
// low-stakes.
const GOOGLE_TYPE_TO_TAG: Record<string, string> = {
  neighborhood: "neighborhood",
  sublocality: "neighborhood",
  sublocality_level_1: "neighborhood",
  locality: "neighborhood",
  beach: "beach",
  park: "park",
  garden: "garden",
  hiking_area: "hiking_trail",
  national_park: "hiking_trail",
  natural_feature: "viewpoint",
  scenic_lookout: "viewpoint",
  marina: "waterfront",
  church: "church",
  place_of_worship: "church",
  hindu_temple: "church",
  mosque: "church",
  synagogue: "church",
  museum: "museum",
  art_gallery: "museum",
  historical_landmark: "historic_site",
  historical_place: "historic_site",
  monument: "landmark",
  tourist_attraction: "landmark",
  restaurant: "restaurant",
  meal_takeaway: "restaurant",
  meal_delivery: "restaurant",
  cafe: "cafe",
  coffee_shop: "cafe",
  bakery: "cafe",
  bar: "bar",
  pub: "bar",
  brewery: "brewery_winery",
  winery: "brewery_winery",
  market: "market",
  farmers_market: "market",
  shopping_mall: "market",
  night_club: "nightlife",
  performing_arts_theater: "live_music_theater",
  concert_hall: "live_music_theater",
  movie_theater: "live_music_theater",
  train_station: "train_station",
  subway_station: "train_station",
  light_rail_station: "train_station",
  transit_station: "train_station",
  airport: "airport",
  international_airport: "airport",
  bus_station: "bus_ferry_station",
  ferry_terminal: "bus_ferry_station",
  stadium: "stadium_venue",
  arena: "stadium_venue",
  zoo: "zoo_aquarium",
  aquarium: "zoo_aquarium",
  spa: "spa",
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

// When several of a place's Google types map to different tags (e.g. the
// Sagrada Familia is both "tourist_attraction" → landmark and "church" →
// church), prefer the most specific/distinctive match — most generic
// ("landmark") goes last so it only wins when nothing sharper matched.
const TAG_PRIORITY = [
  "airport",
  "train_station",
  "bus_ferry_station",
  "church",
  "museum",
  "zoo_aquarium",
  "spa",
  "beach",
  "brewery_winery",
  "cafe",
  "bar",
  "restaurant",
  "market",
  "live_music_theater",
  "stadium_venue",
  "nightlife",
  "hiking_trail",
  "waterfront",
  "garden",
  "park",
  "architecture",
  "historic_site",
  "viewpoint",
  "landmark",
  "neighborhood",
];

export function suggestPrimaryTagFromGoogleTypes(googleTypes: string[] | null | undefined): string | undefined {
  const candidates = new Set(suggestTagsFromGoogleTypes(googleTypes));
  if (candidates.size === 0) return undefined;
  for (const tag of TAG_PRIORITY) {
    if (candidates.has(tag)) return tag;
  }
  return candidates.values().next().value;
}
