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

const SIZE = 26;

/**
 * One trip-map marker, drawn as a real view rather than a `pinColor`.
 *
 * `pinColor` can't express this scheme: hotel and transport share a red fill and
 * food and nightlife share a dark green one, so the glyph is the only thing
 * telling them apart. react-native-maps renders a Marker's children as the
 * marker itself, which is the only way to get a glyph on Android.
 */
export function MapPin({ style }: { style: MapPinStyle }) {
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
