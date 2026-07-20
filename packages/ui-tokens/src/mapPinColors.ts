import type { ThemedColor } from "./categories";

/** Map-pin colors, one per packages/core place tag (8 values) plus a
 * dedicated color for hotel bookings. Deliberately separate from
 * CATEGORY_COLORS (generic UI chrome tokens) — this is a purpose-built
 * palette for what reads well as dots on a map. */
export const MAP_PIN_GROUPS = [
  "activity",
  "day_trip",
  "food_drinks",
  "lodging",
  "other",
  "shopping",
  "site",
  "transit",
] as const;
export type MapPinGroup = (typeof MAP_PIN_GROUPS)[number];

export const MAP_PIN_COLORS: Record<MapPinGroup, ThemedColor> = {
  activity: { light: "#1baf7a", dark: "#199e70" },
  day_trip: { light: "#eb6834", dark: "#d95926" },
  food_drinks: { light: "#e34948", dark: "#e66767" },
  // Hotel bookings, not a place tag — reuses CATEGORY_COLORS' unused "lodging"
  // purple, which fits the name.
  lodging: { light: "#4a3aa7", dark: "#9085e9" },
  // Fallback for places with an unrecognized/missing primaryTag.
  other: { light: "#e87ba4", dark: "#d55181" },
  shopping: { light: "#eda100", dark: "#c98500" },
  site: { light: "#008300", dark: "#008300" },
  transit: { light: "#2a78d6", dark: "#3987e5" },
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
