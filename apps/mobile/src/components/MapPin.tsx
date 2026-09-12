import { View } from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import type { MapPinGlyph, MapPinStyle } from "@travel/ui-tokens";

/** Ionicons stand-ins for the shared glyph set. Web draws the SVG fragments in
 * `mapPinStyles.ts` instead, so these two have to be kept visually in step by
 * hand — same idea, not the same artwork. */
const GLYPH_ICON: Record<MapPinGlyph, keyof typeof Ionicons.glyphMap> = {
  house: "home",
  bicycle: "bicycle",
  cutlery: "restaurant",
  cocktail: "wine",
  question: "help",
};

const CIRCLE_SIZE = 26;
const PIN_WIDTH = 22;
const PIN_HEIGHT = 30;

/**
 * One trip-map marker, drawn as a real view rather than a `pinColor`.
 *
 * `pinColor` can't express this scheme: hotel and transport share a red fill and
 * food and nightlife share a dark green one, so the glyph is the only thing
 * telling them apart. react-native-maps renders a Marker's children as the
 * marker itself, which is the only way to get a glyph on Android.
 */
export function MapPin({ style }: { style: MapPinStyle }) {
  const color = style.color.light;

  if (style.shape === "pin") {
    // The teardrop: a rotated rounded square makes a point at the bottom without
    // needing react-native-svg for one shape.
    return (
      <View style={{ width: PIN_WIDTH, height: PIN_HEIGHT, alignItems: "center" }}>
        <View
          style={{
            width: PIN_WIDTH,
            height: PIN_WIDTH,
            borderRadius: PIN_WIDTH / 2,
            borderBottomRightRadius: 1,
            backgroundColor: color,
            borderWidth: 1.5,
            borderColor: "#fff",
            transform: [{ rotate: "45deg" }],
          }}
        />
      </View>
    );
  }

  return (
    <View
      style={{
        width: CIRCLE_SIZE,
        height: CIRCLE_SIZE,
        borderRadius: CIRCLE_SIZE / 2,
        backgroundColor: color,
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
