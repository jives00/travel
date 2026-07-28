import { describe, expect, it } from "vitest";
import { googleMapsUrl, placeMapsUrl, bookingMapsUrl } from "../googleMaps";

const coords = { lat: 40.4168, lng: -3.7038 };

function query(url: string): string {
  return new URL(url).searchParams.get("query") ?? "";
}

describe("googleMapsUrl", () => {
  it("searches by name and pins the place id when there is one", () => {
    const url = googleMapsUrl({ name: "Prado", address: "Madrid", ...coords, googlePlaceId: "abc123" });
    const params = new URL(url).searchParams;
    expect(params.get("query")).toBe("Prado");
    expect(params.get("query_place_id")).toBe("abc123");
  });

  it("falls back to name + address text when there is no place id", () => {
    const url = googleMapsUrl({ name: "Hotel Alfonso", address: "Calle Mayor 1", ...coords });
    expect(query(url)).toBe("Hotel Alfonso, Calle Mayor 1");
    expect(new URL(url).searchParams.has("query_place_id")).toBe(false);
  });

  it("falls back to coordinates when there is no address either", () => {
    expect(query(googleMapsUrl({ name: "Meetup", ...coords }))).toBe("40.4168,-3.7038");
  });

  // Regression: encodeURIComponent-ing before URLSearchParams double-encoded the
  // comma (%2C -> %252C) and Google reported it couldn't find the location.
  it("encodes the coordinate comma exactly once", () => {
    const url = googleMapsUrl({ name: "Meetup", ...coords });
    expect(url).toContain("40.4168%2C-3.7038");
    expect(url).not.toContain("%252C");
  });
});

describe("bookingMapsUrl", () => {
  const place = { name: "Prado", address: "Madrid", lat: 1, lng: 2, googlePlaceId: "abc123" };

  it("prefers the booking's own coordinates over its linked place", () => {
    const url = bookingMapsUrl({ title: "Day trip", address: "Atocha", ...coords }, place);
    expect(query(url!)).toBe("Day trip, Atocha");
  });

  it("falls back to the linked place when the booking has no coordinates", () => {
    const url = bookingMapsUrl({ title: "Day trip", address: null, lat: null, lng: null }, place);
    expect(url).toBe(placeMapsUrl(place));
  });

  it("returns null with neither coordinates nor a linked place", () => {
    expect(bookingMapsUrl({ title: "UA 118", address: null, lat: null, lng: null })).toBeNull();
    expect(bookingMapsUrl({ title: "UA 118", address: null, lat: null, lng: null }, null)).toBeNull();
  });
});
