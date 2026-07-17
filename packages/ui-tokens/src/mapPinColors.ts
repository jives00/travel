import type { ThemedColor } from "./categories";

/** Map-pin colors, grouped thematically across packages/core's 24 place tags
 * (too many for one distinct color each) plus a dedicated color for hotel
 * bookings. Deliberately separate from CATEGORY_COLORS (the old 7-bucket
 * place `category`, which only drives internal grouping now) — this is a
 * purpose-built palette for what reads well as dots on a map. */
export const MAP_PIN_GROUPS = [
  "food",
  "shopping",
  "sights",
  "nature",
  "nightlife",
  "transit",
  "wellness",
  "lodging",
  "other",
] as const;
export type MapPinGroup = (typeof MAP_PIN_GROUPS)[number];

export const MAP_PIN_COLORS: Record<MapPinGroup, ThemedColor> = {
  food: { light: "#e34948", dark: "#e66767" },
  shopping: { light: "#eda100", dark: "#c98500" },
  sights: { light: "#008300", dark: "#008300" },
  nature: { light: "#1baf7a", dark: "#199e70" },
  nightlife: { light: "#eb6834", dark: "#d95926" },
  transit: { light: "#2a78d6", dark: "#3987e5" },
  wellness: { light: "#0e93a6", dark: "#22d3ee" },
  // Hotel bookings, not a place tag — reuses CATEGORY_COLORS' unused "lodging"
  // purple, which fits the name.
  lodging: { light: "#4a3aa7", dark: "#9085e9" },
  // Fallback for legacy places with no primaryTag set yet.
  other: { light: "#e87ba4", dark: "#d55181" },
};

/** Colors for the /map overview page's 3 buckets — deliberately a separate,
 * smaller palette from MAP_PIN_COLORS above: that one groups by place *tag*
 * (many colors, fine-grained), this one groups by trip *status* (visited vs.
 * planned vs. wishlist), so reusing the tag palette would collide meaning. */
export const MAP_OVERVIEW_GROUPS = ["visited", "planned", "want_to_visit"] as const;
export type MapOverviewGroup = (typeof MAP_OVERVIEW_GROUPS)[number];

export const MAP_OVERVIEW_COLORS: Record<MapOverviewGroup, ThemedColor> = {
  visited: { light: "#008300", dark: "#2fbf2f" },
  planned: { light: "#2a78d6", dark: "#3987e5" },
  want_to_visit: { light: "#8b5cf6", dark: "#a78bfa" },
};
