import { describe, expect, it } from "vitest";
import type { Booking, ItineraryItem, Leg, Place } from "@travel/types";
import { buildShareItineraryText } from "../shareItinerary";

function leg(partial: Partial<Leg>): Leg {
  return {
    id: 1,
    tripId: 1,
    sortOrder: 0,
    city: "Tokyo",
    startDate: null,
    endDate: null,
    dayCount: null,
    lodgingPlaceId: null,
    currency: null,
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

function item(partial: Partial<ItineraryItem>): ItineraryItem {
  return {
    id: 1,
    tripId: 1,
    legId: null,
    dayIndex: null,
    scheduledDate: null,
    time: null,
    sortOrder: 0,
    itemType: "activity",
    placeId: null,
    bookingId: null,
    activityText: null,
    isPrivate: false,
    completed: false,
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

function booking(partial: Partial<Booking>): Booking {
  return {
    id: 1,
    tripId: 1,
    legId: null,
    type: "restaurant",
    title: "Dinner",
    confirmationCode: null,
    flightNumber: null,
    startAt: null,
    endAt: null,
    price: null,
    currency: null,
    placeId: null,
    address: null,
    lat: null,
    lng: null,
    notes: null,
    completed: false,
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

function place(partial: Partial<Place>): Place {
  return { id: 1, name: "Place", ...partial } as Place;
}

const legs = [
  leg({ id: 1, city: "Tokyo", startDate: "2026-03-01", endDate: "2026-03-05" }),
  leg({ id: 2, city: "Kyoto", startDate: "2026-03-06", endDate: "2026-03-09" }),
];

const base = { tripName: "Japan 2026", legs, items: [], places: [], bookings: [] };

describe("buildShareItineraryText", () => {
  it("groups places and non-logistics bookings under their city, with no dates", () => {
    const text = buildShareItineraryText({
      ...base,
      places: [{ ...place({}), id: 10, name: "Senso-ji" }],
      items: [item({ id: 1, legId: 1, itemType: "place", placeId: 10 })],
      bookings: [booking({ id: 2, legId: 2, type: "activity", title: "teamLab" })],
    });
    expect(text).toBe("Japan 2026\n\nTokyo\n- Senso-ji\n\nKyoto\n- teamLab");
  });

  it("drops flight, hotel, train, and car bookings", () => {
    const text = buildShareItineraryText({
      ...base,
      bookings: (["flight", "hotel", "train", "car"] as const).map((type, i) =>
        booking({ id: i + 1, legId: 1, type, title: `${type} booking` }),
      ),
    });
    expect(text).toBe("Japan 2026\n\nNothing to share yet.");
  });

  it("always drops private items", () => {
    const text = buildShareItineraryText({
      ...base,
      items: [item({ id: 1, legId: 1, activityText: "Surprise dinner", isPrivate: true })],
    });
    expect(text).toBe("Japan 2026\n\nNothing to share yet.");
  });

  it("places a dateless, city-less item under Other, last", () => {
    const text = buildShareItineraryText({
      ...base,
      items: [
        item({ id: 1, activityText: "Buy a JR pass" }),
        item({ id: 2, legId: 1, activityText: "Shibuya crossing" }),
      ],
    });
    expect(text).toBe("Japan 2026\n\nTokyo\n- Shibuya crossing\n\nOther\n- Buy a JR pass");
  });

  it("falls back to date-range matching when an item has no leg", () => {
    const text = buildShareItineraryText({
      ...base,
      items: [item({ id: 1, scheduledDate: "2026-03-07", activityText: "Fushimi Inari" })],
    });
    expect(text).toBe("Japan 2026\n\nKyoto\n- Fushimi Inari");
  });

  it("lists a place once when a booking is attached to it", () => {
    const text = buildShareItineraryText({
      ...base,
      places: [{ ...place({}), id: 10, name: "Ichiran Ramen" }],
      items: [item({ id: 1, legId: 1, itemType: "place", placeId: 10 })],
      bookings: [booking({ id: 2, legId: 1, placeId: 10, title: "Ichiran Ramen" })],
    });
    expect(text).toBe("Japan 2026\n\nTokyo\n- Ichiran Ramen");
  });

  it("omits cities with nothing in them", () => {
    const text = buildShareItineraryText({
      ...base,
      items: [item({ id: 1, legId: 2, activityText: "Bamboo grove" })],
    });
    expect(text).toBe("Japan 2026\n\nKyoto\n- Bamboo grove");
  });

  it("treats an itinerary item pointing at a stale leg as Other", () => {
    const text = buildShareItineraryText({
      ...base,
      items: [item({ id: 1, legId: 99, activityText: "Orphaned" })],
    });
    expect(text).toBe("Japan 2026\n\nOther\n- Orphaned");
  });
});
