/** Server-side Directions calls only — the web/Android map SDKs render the map
 * client-side with their own (browser/Android) keys, never this one. This key is
 * unrestricted-by-referrer but API-restricted to Directions only (see build plan §7). */

const BASE = "https://maps.googleapis.com/maps/api/directions/json";

function apiKey(): string {
  const key = process.env.GOOGLE_MAPS_SERVER_KEY;
  if (!key) throw new Error("GOOGLE_MAPS_SERVER_KEY is not set");
  return key;
}

export type TravelMode = "walking" | "transit" | "driving";

export interface DirectionsResult {
  polyline: string;
  distanceMeters: number;
  durationSeconds: number;
}

export async function getDirections(
  origin: { lat: number; lng: number },
  destination: { lat: number; lng: number },
  mode: TravelMode,
): Promise<DirectionsResult | null> {
  const url = new URL(BASE);
  url.searchParams.set("origin", `${origin.lat},${origin.lng}`);
  url.searchParams.set("destination", `${destination.lat},${destination.lng}`);
  url.searchParams.set("mode", mode);
  url.searchParams.set("key", apiKey());

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`Directions ${res.status}`);
  const data = (await res.json()) as {
    status: string;
    routes: { overview_polyline: { points: string }; legs: { distance: { value: number }; duration: { value: number } }[] }[];
  };

  if (data.status !== "OK" || data.routes.length === 0) return null;
  const route = data.routes[0];
  return {
    polyline: route.overview_polyline.points,
    distanceMeters: route.legs.reduce((sum, l) => sum + l.distance.value, 0),
    durationSeconds: route.legs.reduce((sum, l) => sum + l.duration.value, 0),
  };
}
