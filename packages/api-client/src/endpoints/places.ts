import type { CreatePlaceBody, Place, PlaceDuplicateMatch, PlaceListQuery, UpdatePlaceBody } from "@travel/types";
import type { createApiClient } from "../client";

type RequestFn = ReturnType<typeof createApiClient>["request"];

export interface AutocompleteSuggestion {
  placeId: string;
  text: string;
}

export interface PlaceDetails {
  placeId: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  hours: Record<string, string> | null;
  heroPhotoUrl: string | null;
  photos: string[];
  description: string | null;
  rating: number | null;
  userRatingsTotal: number | null;
  website: string | null;
  googleTypes: string[] | null;
}

export function createPlacesEndpoints(request: RequestFn) {
  return {
    list: (query?: PlaceListQuery) => request<Place[]>("/api/places", { query }),
    get: (id: number) => request<Place>(`/api/places/${id}`),
    create: (body: CreatePlaceBody) =>
      request<Place | PlaceDuplicateMatch>("/api/places", { method: "POST", body }),
    update: (id: number, body: UpdatePlaceBody) =>
      request<Place>(`/api/places/${id}`, { method: "PATCH", body }),
    remove: (id: number) => request<void>(`/api/places/${id}`, { method: "DELETE" }),
    // Backfills description/rating/website/hours for a place added before
    // that field set existed — see places.routes.ts's /:id/refresh.
    refreshDetails: (id: number) => request<Place>(`/api/places/${id}/refresh`, { method: "POST" }),
    // Read-only fetch of every Google photo for this place — powers the
    // "pick a different photo" picker (see places.routes.ts's /:id/photos).
    photos: (id: number) => request<{ photos: string[] }>(`/api/places/${id}/photos`),
    // Ideas-tray membership — independent of scheduling (itinerary). markVisited()
    // lands in Slice 7 once visit_records exists.
    addToTrip: (id: number, tripId: number) =>
      request<void>(`/api/places/${id}/trips`, { method: "POST", body: { tripId } }),
    removeFromTrip: (id: number, tripId: number) =>
      request<void>(`/api/places/${id}/trips/${tripId}`, { method: "DELETE" }),
    // Proxied through the API so the Places session token + key never reach the browser directly.
    autocomplete: (input: string, sessionToken: string) =>
      request<AutocompleteSuggestion[]>("/api/places/autocomplete", { query: { input, sessionToken } }),
    // encodeURIComponent is required, not optional — Places API (New) place IDs
    // can contain "/" (and other URL-special characters), which would otherwise
    // split into extra path segments and 404 against the single :placeId route.
    autocompleteDetails: (placeId: string, sessionToken: string) =>
      request<PlaceDetails>(`/api/places/autocomplete/${encodeURIComponent(placeId)}`, { query: { sessionToken } }),
  };
}
