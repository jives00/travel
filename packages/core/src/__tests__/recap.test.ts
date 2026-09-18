import { describe, expect, it } from "vitest";
import type { Booking, DayNote, ItineraryItem, Leg, Place, Trip } from "@travel/types";
import { computeRecap, recapHeadline } from "../recap";

function leg(partial: Partial<Leg> & { id: number }): Leg {
  return {
    tripId: 1,
    sortOrder: 0,
    city: "Madrid",
    startDate: null,
    endDate: null,
    dayCount: null,
    lodgingPlaceId: null,
    currency: null,
    timezone: null,
    lat: null,
    lng: null,
    country: null,
    countryCode: null,
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

function item(partial: Partial<ItineraryItem> & { id: number }): ItineraryItem {
  return {
    tripId: 1,
    legId: null,
    dayIndex: null,
    scheduledDate: null,
    time: null,
    sortOrder: 0,
    itemType: "activity",
    placeId: null,
    bookingId: null,
    activityText: "Something",
    isPrivate: false,
    completed: false,
    completedAt: null,
    createdAt: "",
    updatedAt: "",
    ...partial,
  };
}

function note(date: string, text: string): DayNote {
  return { tripId: 1, date, note: text, createdAt: "", updatedAt: "" };
}

function trip(legs: Leg[]): Trip {
  return {
    id: 1,
    userId: 1,
    name: "Spain",
    heroImageUrl: null,
    listImageUrl: null,
    listImagePhotographerName: null,
    listImagePhotographerUrl: null,
    homeCurrency: "USD",
    archivedAt: null,
    createdAt: "",
    updatedAt: "",
    statusOverride: null,
    isPrimary: false,
    status: "past",
    legs,
  };
}

const base = {
  places: [] as Pick<Place, "id" | "name" | "primaryTag">[],
  bookings: [] as Booking[],
  dayNotes: [] as DayNote[],
};

describe("computeRecap", () => {
  const legs = [
    leg({ id: 1, city: "Seville", startDate: "2026-09-07", endDate: "2026-09-14", country: "Spain", lat: 37.38, lng: -5.97 }),
    leg({ id: 2, city: "Madrid", startDate: "2026-09-14", endDate: "2026-09-18", country: "Spain", lat: 40.42, lng: -3.7 }),
  ];

  it("counts days, cities and countries, deduping the country list", () => {
    const r = computeRecap({ trip: trip(legs), legs, items: [], ...base });
    expect(r.cityCount).toBe(2);
    expect(r.countryCount).toBe(1);
    expect(r.countries).toEqual(["Spain"]);
    // 9/7 through 9/18 inclusive
    expect(r.totalDays).toBe(12);
  });

  it("reports nights per city, not days", () => {
    const r = computeRecap({ trip: trip(legs), legs, items: [], ...base });
    expect(r.cities[0].nights).toBe(7);
    expect(r.cities[1].nights).toBe(4);
  });

  it("ignores a leg whose country was never backfilled rather than inventing one", () => {
    const mixed = [legs[0], leg({ id: 3, city: "Nowhere", startDate: "2026-09-19", endDate: "2026-09-20" })];
    const r = computeRecap({ trip: trip(mixed), legs: mixed, items: [], ...base });
    expect(r.cityCount).toBe(2);
    expect(r.countryCount).toBe(1);
  });

  it("separates what was checked off from what wasn't, and never calls it skipped", () => {
    const items = [
      item({ id: 1, legId: 1, activityText: "Alcázar", completed: true }),
      item({ id: 2, legId: 1, activityText: "Cathedral", completed: true }),
      item({ id: 3, legId: 1, activityText: "Flamenco", completed: false }),
    ];
    const r = computeRecap({ trip: trip(legs), legs, items, ...base });
    expect(r.placesVisited).toBe(2);
    expect(r.placesNotCheckedOff).toBe(1);
    const group = r.cities[0].groups[0];
    expect(group.done).toEqual(["Alcázar", "Cathedral"]);
    expect(group.notCheckedOff).toBe(1);
  });

  it("weaves each city's day notes in by date, and only that city's", () => {
    const dayNotes = [
      note("2026-09-16", "Prado in the morning"),
      note("2026-09-08", "Walked the old town"),
      note("2026-09-10", "Rained all afternoon"),
    ];
    const r = computeRecap({ trip: trip(legs), legs, items: [], ...base, dayNotes });
    expect(r.cities[0].notes.map((n) => n.note)).toEqual(["Walked the old town", "Rained all afternoon"]);
    expect(r.cities[1].notes.map((n) => n.note)).toEqual(["Prado in the morning"]);
  });

  it("computes great-circle distance between consecutive cities", () => {
    const r = computeRecap({ trip: trip(legs), legs, items: [], ...base });
    // Seville → Madrid is ~390km as the crow flies.
    expect(r.crowFlightKm).toBeGreaterThan(350);
    expect(r.crowFlightKm).toBeLessThan(430);
  });

  it("returns no distance when fewer than two cities have coordinates", () => {
    const one = [legs[0], leg({ id: 4, city: "Unlocated", startDate: "2026-09-19", endDate: "2026-09-20" })];
    const r = computeRecap({ trip: trip(one), legs: one, items: [], ...base });
    expect(r.crowFlightKm).toBeNull();
  });

  it("orders cities chronologically via sortLegs, not by array order", () => {
    const reversed = [legs[1], legs[0]];
    const r = computeRecap({ trip: trip(reversed), legs: reversed, items: [], ...base });
    expect(r.cities.map((c) => c.city)).toEqual(["Seville", "Madrid"]);
  });

  it("survives an undated (dreaming) trip without inventing a span", () => {
    const undated = [leg({ id: 5, city: "Tokyo" })];
    const r = computeRecap({ trip: trip(undated), legs: undated, items: [], ...base });
    expect(r.totalDays).toBeNull();
    expect(r.cities[0].nights).toBeNull();
  });

  it("attaches per-leg spend and leaves it null where there is none", () => {
    const r = computeRecap({
      trip: trip(legs),
      legs,
      items: [],
      ...base,
      spendByLeg: [{ legId: 1, current: 820.5 }],
      spend: { current: 820.5, estimated: 1000 },
      homeCurrency: "USD",
    });
    expect(r.cities[0].spend).toBe(820.5);
    expect(r.cities[1].spend).toBeNull();
    expect(r.spend).toBe(820.5);
    expect(r.budgeted).toBe(1000);
  });
});

describe("recapHeadline", () => {
  it("reads as one line, pluralised", () => {
    const legs = [leg({ id: 1, city: "Seville", startDate: "2026-09-07", endDate: "2026-09-14", country: "Spain" })];
    const r = computeRecap({ trip: trip(legs), legs, items: [], ...base });
    expect(recapHeadline(r)).toBe("8 days · 1 city · 1 country");
  });

  it("omits the country clause when nothing has been backfilled", () => {
    const legs = [leg({ id: 1, city: "Seville", startDate: "2026-09-07", endDate: "2026-09-08" })];
    const r = computeRecap({ trip: trip(legs), legs, items: [], ...base });
    expect(recapHeadline(r)).toBe("2 days · 1 city");
  });
});
