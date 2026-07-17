export interface ThemedColor {
  light: string;
  dark: string;
}

/** Fixed, never-cycled categorical order — validated colorblind-safe (see
 * plans/travel-feature-spec.md "Color scheme"). One slot per place category,
 * plus a reserved 9th slot for a hypothetical future category. */
export const CATEGORY_COLORS: Record<string, ThemedColor> = {
  transit: { light: "#2a78d6", dark: "#3987e5" },
  activity: { light: "#1baf7a", dark: "#199e70" },
  shopping: { light: "#eda100", dark: "#c98500" },
  sight: { light: "#008300", dark: "#008300" },
  lodging: { light: "#4a3aa7", dark: "#9085e9" },
  food: { light: "#e34948", dark: "#e66767" },
  other: { light: "#e87ba4", dark: "#d55181" },
};

/** Unused — reserved for a future 9th category rather than inventing a color on the fly. */
export const RESERVED_COLOR: ThemedColor = { light: "#eb6834", dark: "#d95926" };

/** Blue doubles as the app's primary UI accent (buttons, links, route line, "you are here"). */
export const PRIMARY_ACCENT = CATEGORY_COLORS.transit;
