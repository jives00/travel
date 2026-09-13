import { View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import Svg, { Circle, Path } from "react-native-svg";
import { PIN_ART, type MapPinGlyph, type MapPinStyle } from "@travel/ui-tokens";

/** Ionicons stand-ins for the shared glyph set. Web draws the SVG fragments in
 * `mapPinStyles.ts` instead, so these two have to be kept visually in step by
 * hand — same idea, not the same artwork. (The default pin no longer has this
 * problem: since react-native-svg landed it renders the shared path itself, and
 * these four could follow the same way.) */
const GLYPH_ICON: Record<MapPinGlyph, keyof typeof Ionicons.glyphMap> = {
  house: "home",
  bicycle: "bicycle",
  cutlery: "restaurant",
  cocktail: "wine",
  question: "help",
};

const SIZE = 26;

const PIN_W = Math.round(PIN_ART.viewBoxWidth * PIN_ART.size);
const PIN_H = Math.round(PIN_ART.viewBoxHeight * PIN_ART.size);

/**
 * The default pin, drawn from the same path string web uses.
 *
 * Google's marker — round head, concave neck, stem with a flat foot — needs a
 * path renderer: plain Views can manage the head and the stem but not the neck
 * between them, and head-plus-stem renders as a lollipop. Hence
 * react-native-svg, which also means there is exactly one copy of this artwork
 * rather than two that drift.
 *
 * The marker anchors at its bottom-center pixel (`mapPinAnchorFraction`), so
 * the stem's foot lands on the coordinate it marks.
 */
function DefaultPin({ color }: { color: string }) {
  return (
    <Svg
      width={PIN_W}
      height={PIN_H}
      viewBox={`0 0 ${PIN_ART.viewBoxWidth} ${PIN_ART.viewBoxHeight}`}
    >
      <Path
        d={PIN_ART.path}
        fill={color}
        stroke={PIN_ART.stroke}
        strokeWidth={PIN_ART.strokeWidth}
        strokeLinejoin="round"
      />
      <Circle cx={PIN_ART.holeX} cy={PIN_ART.holeY} r={PIN_ART.holeR} fill={PIN_ART.hole} />
    </Svg>
  );
}

/**
 * One trip-map marker, drawn as a real view rather than a `pinColor`.
 *
 * `pinColor` can't express this scheme: hotel and transport share a red fill and
 * food and nightlife share a dark green one, so the glyph is the only thing
 * telling them apart, and the default pin isn't even a circle. react-native-maps
 * renders a Marker's children as the marker itself, which is the only way to get
 * either on Android.
 *
 * Callers must pass the matching `anchor` — `mapPinAnchorFraction(style)` — or
 * the default pin will hover half its height above the place it marks.
 */
export function MapPin({ style }: { style: MapPinStyle }) {
  if (style.shape === "pin") return <DefaultPin color={style.color} />;
  return (
    <View
      style={{
        width: SIZE,
        height: SIZE,
        borderRadius: SIZE / 2,
        backgroundColor: style.color,
        borderWidth: 1.5,
        borderColor: "#fff",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {style.glyph && <Ionicons name={GLYPH_ICON[style.glyph]} size={14} color="#fff" />}
    </View>
  );
}
