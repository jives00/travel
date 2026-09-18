import { describe, expect, it } from "vitest";
import type { Booking, Leg, Place, Trip } from "@travel/types";
import {
  computeReadiness,
  legDatesKey,
  legLodgingKey,
  placeUnscheduledKey,
  readinessNudgeLabel,
} from "../readiness";

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

function hotel(legId: number | null): Booking {
  return {
    id: 100,
    tripId: 1,
    legId,
    type: "hotel",
    title: "Hotel",
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
  };
}

function place(id: number, status: Place["status"], name = "Somewhere"): Pick<Place, "id" | "name" | "status"> {
  return { id, name, status };
}

const trip = (status: Trip["status"]): Pick<Trip, "status"> => ({ status });

const dated = { startDate: "2026-03-01", endDate: "2026-03-04" };

describe("computeReadiness", () => {
  it("counts only the cities that are actually missing something", () => {
    const r = computeReadiness({
      trip: trip("planned"),
      legs: [leg({ id: 1, city: "Madrid" }), leg({ id: 2, city: "Seville", ...dated })],
      bookings: [hotel(2)],
      places: [],
    });
    expect(r.groups.map((g) => g.text)).toEqual(["1 city still needs dates", "1 city has no lodging set"]);
    expect(r.groups[0].nudges.map((n) => n.key)).toEqual([legDatesKey(1)]);
    expect(r.groups[1].nudges.map((n) => n.key)).toEqual([legLodgingKey(1)]);
  });

  it("holds off on dates while the trip is still a daydream, and on everything once it's over", () => {
    const legs = [leg({ id: 1 })];
    expect(computeReadiness({ trip: trip("dreaming"), legs, bookings: [], places: [] }).groups.map((g) => g.rule)).toEqual(
      ["leg-lodging"],
    );
    expect(computeReadiness({ trip: trip("past"), legs, bookings: [], places: [] }).groups).toEqual([]);
  });

  it("splits ideas out as info, not a warning", () => {
    const r = computeReadiness({
      trip: trip("planned"),
      legs: [],
      bookings: [],
      places: [place(5, "idea"), place(6, "planned")],
    });
    expect(r.groups).toHaveLength(1);
    expect(r.groups[0]).toMatchObject({ tone: "info", text: "1 idea not yet scheduled onto a day" });
    expect(r.groups[0].nudges[0].key).toBe(placeUnscheduledKey(5));
  });

  it("drops a dismissed subject from its line and re-counts the rest", () => {
    const input = {
      trip: trip("planned"),
      legs: [leg({ id: 1, city: "Madrid" }), leg({ id: 2, city: "Seville" }), leg({ id: 3, city: "Ronda" })],
      bookings: [hotel(1), hotel(2), hotel(3)],
      places: [],
    };
    expect(computeReadiness(input).groups[0].text).toBe("3 cities still need dates");
    const r = computeReadiness(input, [legDatesKey(2)]);
    expect(r.groups[0].text).toBe("2 cities still need dates");
    expect(r.dismissed.map(readinessNudgeLabel)).toEqual(["Seville needs dates"]);
  });

  it("keeps warning about a city added after the line was dismissed", () => {
    const base = {
      trip: trip("planned"),
      legs: [leg({ id: 1, city: "Madrid" })],
      bookings: [hotel(1)],
      places: [],
    };
    const dismissed = [legDatesKey(1)];
    expect(computeReadiness(base, dismissed).groups).toEqual([]);

    const withNewCity = { ...base, legs: [...base.legs, leg({ id: 2, city: "Seville" })], bookings: [hotel(1), hotel(2)] };
    expect(computeReadiness(withNewCity, dismissed).groups[0].text).toBe("1 city still needs dates");
  });

  it("reports a dismissal only while its condition still holds", () => {
    const fixed = {
      trip: trip("planned"),
      legs: [leg({ id: 1, ...dated })],
      bookings: [hotel(1)],
      places: [],
    };
    const r = computeReadiness(fixed, [legDatesKey(1)]);
    expect(r.groups).toEqual([]);
    expect(r.dismissed).toEqual([]);
  });
});
