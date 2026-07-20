// Google Maps ignores the app's `data-theme` — it always renders its default
// light tiles unless given an explicit style array, so the mini/global maps
// stayed a bright rectangle inside an otherwise all-dark UI. Applied via
// `styles` on map creation and `setOptions` when the theme flips at runtime.
export const DARK_MAP_STYLE = [
  { elementType: "geometry", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#1a1a2e" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#8a8fa3" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ color: "#3d4258" }] },
  { featureType: "administrative.country", elementType: "labels.text.fill", stylers: [{ color: "#a8adc0" }] },
  { featureType: "landscape", elementType: "geometry", stylers: [{ color: "#22263a" }] },
  { featureType: "poi", elementType: "geometry", stylers: [{ color: "#26293f" }] },
  { featureType: "poi", elementType: "labels.text.fill", stylers: [{ color: "#6b7086" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#233229" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#38394a" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#212230" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#4a4c63" }] },
  { featureType: "transit", elementType: "geometry", stylers: [{ color: "#2a2d40" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#131628" }] },
  { featureType: "water", elementType: "labels.text.fill", stylers: [{ color: "#5c6280" }] },
];
