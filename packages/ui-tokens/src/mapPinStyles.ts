import type { ThemedColor } from "./categories";
import type { MapPinGroup } from "./mapPinColors";

/**
 * How a trip-map pin actually looks: shape, fill, and the white glyph inside it.
 *
 * Deliberately coarser than MAP_PIN_COLORS' nine tag colors. This mirrors the
 * scheme used in the owner's own Google Maps saved lists, so the app's map and
 * the mental model built up in Google Maps agree: hotel and transport are both
 * red, food and nightlife are both dark green, and everything else that's just
 * "somewhere we're going" is one light-green pin.
 *
 * Because two pairs share a fill (red, dark green), **the glyph is the only
 * thing distinguishing them** — a color-only renderer (react-native-maps'
 * `pinColor`, a plain Symbol path) cannot express this scheme. Both platforms
 * must draw the glyph.
 */

export const MAP_PIN_GLYPHS = ["house", "bicycle", "cutlery", "cocktail", "question"] as const;
export type MapPinGlyph = (typeof MAP_PIN_GLYPHS)[number];

export const MAP_PIN_STYLE_KEYS = [
  "default",
  "food_drinks",
  "lodging",
  "nightlife",
  "private",
  "transit",
] as const;
export type MapPinStyleKey = (typeof MAP_PIN_STYLE_KEYS)[number];

export interface MapPinStyle {
  /** "pin" is the classic teardrop (24x36, anchored at its tip); "circle" is a
   * 24x24 dot anchored at its center. */
  shape: "pin" | "circle";
  color: ThemedColor;
  /** null = no glyph, the shape alone carries the meaning (the default pin). */
  glyph: MapPinGlyph | null;
}

const RED: ThemedColor = { light: "#d93a33", dark: "#e4574f" };
const DARK_GREEN: ThemedColor = { light: "#0f6b3a", dark: "#14804a" };
const LIGHT_GREEN: ThemedColor = { light: "#6fbf4a", dark: "#7ecf5c" };
const DARK_BLUE: ThemedColor = { light: "#1e3a8a", dark: "#2b4bad" };

export const MAP_PIN_STYLES: Record<MapPinStyleKey, MapPinStyle> = {
  // Anything we're going to that isn't food, a bed, or a way of getting there.
  // The only teardrop in the set, so "ordinary stop" reads instantly.
  default: { shape: "pin", color: LIGHT_GREEN, glyph: null },
  food_drinks: { shape: "circle", color: DARK_GREEN, glyph: "cutlery" },
  lodging: { shape: "circle", color: RED, glyph: "house" },
  nightlife: { shape: "circle", color: DARK_GREEN, glyph: "cocktail" },
  // Overrides the category entirely: the point of a private item is that a
  // glance at the map doesn't reveal what it is, so it must not keep a glyph
  // that gives the game away.
  private: { shape: "circle", color: DARK_BLUE, glyph: "question" },
  transit: { shape: "circle", color: RED, glyph: "bicycle" },
};

/** Every place tag / booking type collapses into one of the six styles above.
 * `isPrivate` wins over everything else. */
export function mapPinStyleKeyFor(group: MapPinGroup | string, isPrivate = false): MapPinStyleKey {
  if (isPrivate) return "private";
  switch (group) {
    case "lodging":
      return "lodging";
    case "transit":
      return "transit";
    case "food_drinks":
      return "food_drinks";
    case "nightlife":
      return "nightlife";
    // activity, day_trip, other, shopping and site all intentionally land here.
    default:
      return "default";
  }
}

export function mapPinStyleFor(group: MapPinGroup | string, isPrivate = false): MapPinStyle {
  return MAP_PIN_STYLES[mapPinStyleKeyFor(group, isPrivate)];
}

/** White glyph artwork, drawn on a 24x24 grid and scaled down to sit inside a
 * circle. Kept as raw SVG fragments (not path strings) because a bicycle needs
 * its wheels — web renders these directly; mobile draws the native equivalent
 * from its own icon font, so these two must be kept visually in step by hand. */
const GLYPH_SVG: Record<MapPinGlyph, string> = {
  house: '<path d="M12 3 3 10.5V21h6v-6h6v6h6V10.5z" fill="#fff"/>',
  bicycle:
    '<g fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<circle cx="6" cy="16.5" r="4.2"/><circle cx="18" cy="16.5" r="4.2"/>' +
    '<path d="M6 16.5 9.8 7.5h4.4L18 16.5M8.8 7.5h5"/></g>',
  cutlery:
    '<g fill="#fff">' +
    // fork: two tines merging into a stem
    '<path d="M6 3h1.3v5.2h1V3h1.3v6.2c0 1-.5 1.8-1.3 2.1V21H7.3v-9.7C6.5 11 6 10.2 6 9.2z"/>' +
    // spoon: oval bowl over a handle
    '<path d="M16.2 3c1.7 0 3 1.7 3 3.8s-1.3 3.8-3 3.8-3-1.7-3-3.8S14.5 3 16.2 3zm-.8 8.4h1.6V21h-1.6z"/>' +
    "</g>",
  cocktail: '<path d="M4 4h16l-7 8.2V19h3.6v2H7.4v-2H11v-6.8z" fill="#fff"/>',
  // Text rather than a path: a "?" is a glyph the renderer already has, and
  // hand-drawing one at this size looks worse than letting the font do it.
  question:
    '<text x="12" y="18" text-anchor="middle" font-family="Arial,Helvetica,sans-serif" ' +
    'font-size="17" font-weight="bold" fill="#fff">?</text>',
};

export interface MapPinSvg {
  svg: string;
  width: number;
  height: number;
  /** Where the artwork touches the coordinate it marks — a teardrop points at
   * its tip, a circle sits over its center. */
  anchorX: number;
  anchorY: number;
}

const TEARDROP =
  "M12 0C5.373 0 0 5.373 0 12c0 9 12 24 12 24s12-15 12-24C24 5.373 18.627 0 12 0z";

/** Renders one pin as a standalone SVG document, for use as an <img>/data-URI
 * map marker. Glyph is scaled to ~14px and centered inside the circle. */
export function mapPinSvg(style: MapPinStyle, theme: "light" | "dark" = "light"): MapPinSvg {
  const fill = style.color[theme];
  if (style.shape === "pin") {
    return {
      svg:
        '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="36" viewBox="0 0 24 36">' +
        `<path d="${TEARDROP}" fill="${fill}" stroke="#ffffff" stroke-width="1.5"/>` +
        "</svg>",
      width: 24,
      height: 36,
      anchorX: 12,
      anchorY: 36,
    };
  }
  const glyph = style.glyph ? GLYPH_SVG[style.glyph] : "";
  return {
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
      `<circle cx="12" cy="12" r="11" fill="${fill}" stroke="#ffffff" stroke-width="1.5"/>` +
      (glyph ? `<g transform="translate(5.2 5.2) scale(0.567)">${glyph}</g>` : "") +
      "</svg>",
    width: 24,
    height: 24,
    anchorX: 12,
    anchorY: 12,
  };
}
