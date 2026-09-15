import type { MapPinGroup } from "./mapPinColors";

/**
 * How a trip-map pin actually looks: fill color and the white glyph inside it.
 *
 * Deliberately coarser than MAP_PIN_COLORS' nine tag colors. This mirrors the
 * scheme used in the owner's own Google Maps saved lists, so the app's map and
 * the mental model built up in Google Maps agree: hotel and transport are both
 * red, food and nightlife are both dark green, and everything else that's just
 * "somewhere we're going" is Google's own green marker.
 *
 * Because two pairs share a fill (red, dark green), **the glyph is the only
 * thing distinguishing them** — a color-only renderer (react-native-maps'
 * `pinColor`, a plain Symbol path) cannot express this scheme. Both platforms
 * must draw the glyph.
 *
 * The four glyph pins are circles sitting over the point they mark. The default
 * pin is the odd one out on purpose: it is Google's own green marker — a round
 * head with a hole, a concave neck, a stem with a flat foot — which the owner
 * already reads as "a saved place" everywhere else, so it keeps that shape
 * rather than being flattened into a fifth circle.
 *
 * That costs the two things the all-circles rule existed to avoid. A second
 * anchor rule: it stands on its foot, not over its center (`mapPinAnchorFraction`
 * is the single source for both). And a path renderer on mobile: the concave
 * neck cannot be built from plain Views — a head View plus a stem View renders
 * as a lollipop — so `MapPin.tsx` draws `PIN_ART` with react-native-svg.
 *
 * Colors are flat rather than ThemedColor because both renderers only ever read
 * the light value — the dark map style already darkens everything around the
 * pins, so recoloring the pins too only muddies them.
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

export type MapPinShape = "circle" | "pin";

export interface MapPinStyle {
  color: string;
  /** null = no glyph; the fill alone carries the meaning (the default pin). */
  glyph: MapPinGlyph | null;
  /** "pin" also implies the dark outline and the hollow center — that
   * combination *is* the Google marker, so the renderers derive it from the
   * shape rather than carrying three more fields no other pin would use. */
  shape: MapPinShape;
}

const RED = "#a52714";
const DARK_GREEN = "#097138";
const GREEN = "#56fb7a";
const DARK_BLUE = "#1e3a8a";

/** The pin's outline and its punched-out center, both sampled off Google's own
 * green marker. Near-black on a bright fill, so the pin still reads as a pin
 * against pale beige, park green and satellite imagery alike. */
const PIN_STROKE = "#1d2b21";
const PIN_HOLE = "#000000";

export const MAP_PIN_STYLES: Record<MapPinStyleKey, MapPinStyle> = {
  // Anything we're going to that isn't food, a bed, or a way of getting there —
  // the most common pin by far, and the only glyphless one. It doesn't need a
  // glyph because the *shape* carries it: this is Google's stock green marker,
  // sampled colors and all, which already means "a place" to anyone who has used
  // My Maps. The dark outline and hollow center are what keep a bright green
  // legible on Google's pale beige and park green.
  default: { color: GREEN, glyph: null, shape: "pin" },
  food_drinks: { color: DARK_GREEN, glyph: "cutlery", shape: "circle" },
  lodging: { color: RED, glyph: "house", shape: "circle" },
  nightlife: { color: DARK_GREEN, glyph: "cocktail", shape: "circle" },
  // Overrides the category entirely: the point of a private item is that a
  // glance at the map doesn't reveal what it is, so it must not keep a glyph
  // that gives the game away.
  private: { color: DARK_BLUE, glyph: "question", shape: "circle" },
  transit: { color: RED, glyph: "bicycle", shape: "circle" },
};

/** Where the marker's box should sit over its coordinate, as fractions of that
 * box — react-native-maps' `anchor` unit. A circle is centered on the point;
 * the default pin stands above it on the foot of its stem. Web reads
 * `mapPinSvg`'s pixel anchors instead, which say the same thing in the unit the
 * Maps JS API wants. */
export function mapPinAnchorFraction(style: MapPinStyle): { x: number; y: number } {
  return style.shape === "pin" ? { x: 0.5, y: 1 } : { x: 0.5, y: 0.5 };
}

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

/** A checked-off place or booking keeps its pin — same shape, same glyph — and
 * only loses its color. Grey is the whole signal: what is left in color is what
 * is left to do, while the trip's history stays on the map instead of vanishing
 * from it (which is what checking something off used to do).
 *
 * Deliberately a mid grey rather than a pale one: it has to stay visible on
 * Google's pale beige and on satellite imagery, and a completed pin is still a
 * place you want to be able to find. */
export const MAP_PIN_COMPLETED_COLOR = "#a6a6a6";

/** Greys a style in place. Applied *after* the private override, so a completed
 * private item is a grey "?" — it neither reveals its category nor pretends it
 * is still pending. */
export function completedPinStyle(style: MapPinStyle): MapPinStyle {
  return { ...style, color: MAP_PIN_COMPLETED_COLOR };
}

export function mapPinStyleFor(group: MapPinGroup | string, isPrivate = false, completed = false): MapPinStyle {
  const style = MAP_PIN_STYLES[mapPinStyleKeyFor(group, isPrivate)];
  return completed ? completedPinStyle(style) : style;
}

/** White glyph artwork, drawn on a 24x24 grid and scaled down to sit inside the
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
  /** In px from the SVG's top-left: a circle's center, the default pin's foot. */
  anchorX: number;
  anchorY: number;
}

/** Google's marker outline on a 22x34 grid, fitted to the real artwork rather
 * than guessed: an ellipse head (rx 9.61, ry 8.78 about (11, 9.62)) whose flanks
 * pinch into a concave neck and run down to a blunt stem at y=32.9.
 *
 * It is *not* a teardrop. The first attempt here was a smooth taper to a point,
 * which is a different icon; the reference has a distinct head, a concave notch
 * under it, and a near-parallel stem with a flat end. The numbers below come
 * from maximising silhouette overlap with the reference image (95.7% IoU) — the
 * residual is that image's own antialiasing at 17px wide. Don't "tidy" them.
 *
 * Rendered at 22x34, the head is 20.4 wide, which is why this pin's box is
 * larger than the 24x24 circles: its bottom 40% is stem, not pin. */
const PIN_PATH =
  "M5.83 17.02C6.67 19.98 9.88 26.12 9.88 27.88L9.89 32.89L12.11 32.89" +
  "L12.12 27.88C12.12 26.12 15.32 19.98 16.18 17.02A9.61 8.78 0 1 0 5.83 17.02Z";

/** Renders one pin as a standalone SVG document, for use as an <img>/data-URI
 * map marker. Glyph is scaled to ~14px and centered. */
export function mapPinSvg(style: MapPinStyle): MapPinSvg {
  if (style.shape === "pin") {
    return {
      svg:
        '<svg xmlns="http://www.w3.org/2000/svg" width="22" height="34" viewBox="0 0 22 34">' +
        `<path d="${PIN_PATH}" fill="${style.color}" stroke="${PIN_STROKE}" stroke-width="1.2" stroke-linejoin="round"/>` +
        `<circle cx="11" cy="9.62" r="3.3" fill="${PIN_HOLE}"/>` +
        "</svg>",
      width: 22,
      height: 34,
      // The stem's flat bottom, not the head's center: this pin stands on the
      // point it marks rather than sitting over it.
      anchorX: 11,
      anchorY: 33.5,
    };
  }
  const glyph = style.glyph ? GLYPH_SVG[style.glyph] : "";
  return {
    svg:
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">' +
      `<circle cx="12" cy="12" r="11" fill="${style.color}" stroke="#ffffff" stroke-width="1.5"/>` +
      (glyph ? `<g transform="translate(5.2 5.2) scale(0.567)">${glyph}</g>` : "") +
      "</svg>",
    width: 24,
    height: 24,
    anchorX: 12,
    anchorY: 12,
  };
}

/** The same artwork as `mapPinSvg`, but as the pieces a path renderer needs
 * rather than a finished SVG document — mobile draws these with react-native-svg
 * so that both platforms render one path string instead of two lookalikes.
 *
 * `size` scales the whole 22x34 grid; the marker box is `22*size` by `34*size`
 * and its anchor is the bottom-center pixel, which is what
 * `mapPinAnchorFraction` reports. At size 1.1 the head is ~22px, a shade larger
 * than the 26px circles' own 26px, which is right: the head is the part that
 * has to compete with them, and the stem is extra height, not extra weight. */
export const PIN_ART = {
  path: PIN_PATH,
  viewBoxWidth: 22,
  viewBoxHeight: 34,
  strokeWidth: 1.2,
  stroke: PIN_STROKE,
  hole: PIN_HOLE,
  holeX: 11,
  holeY: 9.62,
  holeR: 3.3,
  /** Multiplier applied to the 22x34 grid to get the rendered marker box. */
  size: 1.1,
} as const;
