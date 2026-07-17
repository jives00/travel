/** Targets Places API (New) — places.googleapis.com/v1 — not the legacy
 * maps.googleapis.com/maps/api/place endpoints. Session tokens are threaded
 * through so a whole typing session bills as one Autocomplete session, not one
 * per keystroke (see travel-feature-spec.md "Cost notes"). */

const BASE = "https://places.googleapis.com/v1";

function apiKey(): string {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) throw new Error("GOOGLE_PLACES_API_KEY is not set");
  return key;
}

export interface AutocompleteSuggestion {
  placeId: string;
  text: string;
}

export async function autocomplete(input: string, sessionToken: string): Promise<AutocompleteSuggestion[]> {
  const res = await fetch(`${BASE}/places:autocomplete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey(),
    },
    body: JSON.stringify({ input, sessionToken }),
  });
  if (!res.ok) throw new Error(`Places autocomplete ${res.status}`);
  const data = (await res.json()) as {
    suggestions?: { placePrediction?: { placeId: string; text?: { text: string } } }[];
  };
  return (data.suggestions ?? [])
    .filter((s) => s.placePrediction)
    .map((s) => ({
      placeId: s.placePrediction!.placeId,
      text: s.placePrediction!.text?.text ?? "",
    }));
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  hours: Record<string, string> | null;
  heroPhotoUrl: string | null;
  // All photos Google has for this place (heroPhotoUrl is just photos[0]) —
  // lets the UI offer a picker instead of only ever showing the first one.
  photos: string[];
  description: string | null;
  rating: number | null;
  userRatingsTotal: number | null;
  website: string | null;
  googleTypes: string[] | null;
}

// `rating`/`userRatingCount`/`websiteUri`/`editorialSummary`/`types` push this
// onto the Pro/Enterprise Place Details SKU rather than Essentials — still
// negligible cost for a single-user app calling this once per new place, but
// worth knowing the field mask is what determines the billing tier. Deliberately
// NOT requesting `reviews` — Google's terms impose stricter re-fetch/attribution
// rules on cached individual review text; the aggregate rating + count (which,
// like the place ID, Google permits caching indefinitely) is a plainer trade.
const FIELD_MASK =
  "id,displayName,formattedAddress,location,regularOpeningHours,photos,rating,userRatingCount,websiteUri,editorialSummary,types";

/** Normally fetched once at place creation and stored (the expensive SKU) —
 * `sessionToken` is only meaningful for ending an Autocomplete billing session,
 * so it's omitted for the manual "refresh from Google" re-fetch on a place
 * that already exists (e.g. one added before this field set was tracked). */
export async function placeDetails(placeId: string, sessionToken?: string): Promise<PlaceDetails> {
  const url = sessionToken ? `${BASE}/places/${placeId}?sessionToken=${sessionToken}` : `${BASE}/places/${placeId}`;
  const res = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": apiKey(),
      "X-Goog-FieldMask": FIELD_MASK,
    },
  });
  if (!res.ok) throw new Error(`Place details ${res.status}`);
  const data = (await res.json()) as {
    id: string;
    displayName?: { text: string };
    formattedAddress?: string;
    location?: { latitude: number; longitude: number };
    regularOpeningHours?: { weekdayDescriptions?: string[] };
    photos?: { name: string }[];
    rating?: number;
    userRatingCount?: number;
    websiteUri?: string;
    editorialSummary?: { text?: string };
    types?: string[];
  };

  // Capped at 9 — Google returns up to 10 per place, and a picker grid doesn't
  // need more than that for a personal-use app.
  const photos = (data.photos ?? [])
    .slice(0, 9)
    .map((p) => `${BASE}/${p.name}/media?key=${apiKey()}&maxWidthPx=800`);

  return {
    placeId: data.id,
    name: data.displayName?.text ?? "",
    address: data.formattedAddress ?? null,
    lat: data.location?.latitude ?? 0,
    lng: data.location?.longitude ?? 0,
    hours: data.regularOpeningHours?.weekdayDescriptions
      ? Object.fromEntries(data.regularOpeningHours.weekdayDescriptions.map((d, i) => [String(i), d]))
      : null,
    heroPhotoUrl: photos[0] ?? null,
    photos,
    description: data.editorialSummary?.text ?? null,
    rating: data.rating ?? null,
    userRatingsTotal: data.userRatingCount ?? null,
    website: data.websiteUri ?? null,
    googleTypes: data.types ?? null,
  };
}
