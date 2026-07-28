import type { Booking, Place } from "@travel/types";

/** Builds a Google Maps deep link. The `/maps/search/?api=1` form is the
 * documented cross-platform one: on Android/iOS it hands off to the Google Maps
 * app when installed and falls back to the website otherwise, so both platforms
 * can use the same URL without sniffing for a `comgooglemaps://` scheme. */
export function googleMapsUrl(opts: {
  name: string;
  address?: string | null;
  lat: number;
  lng: number;
  googlePlaceId?: string | null;
}): string {
  // Prefer searching by name+address text over raw "lat,lng" whenever we
  // have it (e.g. hotels, which have no googlePlaceId) — a coordinate query
  // just drops a generic pin at that point instead of resolving to the
  // actual business, even when it's the exact spot the business sits at.
  const query = opts.googlePlaceId
    ? opts.name
    : opts.address
      ? `${opts.name}, ${opts.address}`
      : `${opts.lat},${opts.lng}`;
  // Hand-rolled rather than URLSearchParams: this package compiles with
  // `lib: ["ES2022"]` and no DOM/Node types, so that global isn't available
  // here (it only resolved by accident via a hoisted @types/node locally, and
  // broke the Docker build). Encode each value exactly once — double-encoding
  // the comma in "lat,lng" (%2C -> %252C) is what once made Google Maps report
  // it couldn't find the garbled query.
  const params = [`api=1`, `query=${encodeURIComponent(query)}`];
  if (opts.googlePlaceId) params.push(`query_place_id=${encodeURIComponent(opts.googlePlaceId)}`);
  return `https://www.google.com/maps/search/?${params.join("&")}`;
}

/** A library place always has coordinates (both columns are NOT NULL), so this
 * always produces a link. */
export function placeMapsUrl(place: Pick<Place, "name" | "address" | "lat" | "lng" | "googlePlaceId">): string {
  return googleMapsUrl({
    name: place.name,
    address: place.address,
    lat: place.lat,
    lng: place.lng,
    googlePlaceId: place.googlePlaceId,
  });
}

/** A booking's location is optional and can come from either of two places: its
 * own address/lat/lng, or the place it's linked to. Returns null when it has
 * neither — a flight with no address has nothing to point at. Bookings never
 * carry a googlePlaceId of their own, so a linked place is also the only way one
 * resolves to a specific business rather than a text search. */
export function bookingMapsUrl(
  booking: Pick<Booking, "title" | "address" | "lat" | "lng">,
  linkedPlace?: Pick<Place, "name" | "address" | "lat" | "lng" | "googlePlaceId"> | null,
): string | null {
  if (booking.lat != null && booking.lng != null) {
    return googleMapsUrl({
      name: booking.title,
      address: booking.address,
      lat: booking.lat,
      lng: booking.lng,
    });
  }
  return linkedPlace ? placeMapsUrl(linkedPlace) : null;
}
