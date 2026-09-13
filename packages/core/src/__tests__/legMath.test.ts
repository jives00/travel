import { describe, expect, it } from "vitest";
import type { Leg, Trip } from "@travel/types";
import { daysOfLeg, isTravelDay, legForDate, remapRelativeDay, sortLegs } from "../legMath";

function leg(partial: Partial<Leg>): Leg {
  return {
    id: 1,
    tripId: 1,
    sortOrder: 0,
    city: "Madrid",
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

function trip(legs: Leg[]): Trip {
  return {
    id: 1,
    userId: 1,
    name: "Spain 2026",
    heroImageUrl: null,
    homeCurrency: null,
    archivedAt: null,
    createdAt: "",
    updatedAt: "",
    status: "planned",
    legs,
  };
}

describe("legForDate", () => {
  const madrid = leg({ id: 1, city: "Madrid", startDate: "2026-03-03", endDate: "2026-03-06" });
  const seville = leg({ id: 2, city: "Seville", startDate: "2026-03-06", endDate: "2026-03-08" });
  const t = trip([madrid, seville]);

  it("resolves a plain in-range day to its leg", () => {
    expect(legForDate(t, "2026-03-04")?.city).toBe("Madrid");
    expect(legForDate(t, "2026-03-07")?.city).toBe("Seville");
  });

  it("prefers the check-in leg on the exact boundary day", () => {
    // Mar 6 is Madrid's checkout AND Seville's check-in
    expect(legForDate(t, "2026-03-06")?.city).toBe("Seville");
  });

  it("flags the boundary day as a travel day", () => {
    expect(isTravelDay(t, "2026-03-06")).toBe(true);
    expect(isTravelDay(t, "2026-03-04")).toBe(false);
    expect(isTravelDay(t, "2026-03-07")).toBe(false);
  });

  it("returns null outside every leg's range", () => {
    expect(legForDate(t, "2026-01-01")).toBeNull();
  });
});

describe("daysOfLeg / remapRelativeDay", () => {
  it("enumerates dated legs by real calendar date", () => {
    const l = leg({ startDate: "2026-03-03", endDate: "2026-03-05" });
    const days = daysOfLeg(l);
    expect(days).toHaveLength(3);
    expect(days[0].date).toBe("2026-03-03");
    expect(days[2].date).toBe("2026-03-05");
  });

  it("enumerates dateless legs by relative day count", () => {
    const l = leg({ dayCount: 3 });
    const days = daysOfLeg(l);
    expect(days).toHaveLength(3);
    expect(days.every((d) => d.date === null)).toBe(true);
    expect(days[1].label).toBe("Day 2");
  });

  it("remaps a relative day index once the leg is dated", () => {
    const l = leg({ startDate: "2026-03-03", endDate: "2026-03-05" });
    expect(remapRelativeDay(l, 0)).toBe("2026-03-03");
    expect(remapRelativeDay(l, 2)).toBe("2026-03-05");
  });

  it("returns null when the leg still has no dates", () => {
    const l = leg({ dayCount: 3 });
    expect(remapRelativeDay(l, 1)).toBeNull();
  });
});

describe("sortLegs", () => {
  it("orders by start date, then end date", () => {
    const long = leg({ id: 1, sortOrder: 0, startDate: "2026-09-01", endDate: "2026-09-07" });
    const sameDay = leg({ id: 2, sortOrder: 1, startDate: "2026-09-07", endDate: "2026-09-07" });
    const next = leg({ id: 3, sortOrder: 2, startDate: "2026-09-07", endDate: "2026-09-14" });
    expect(sortLegs([next, sameDay, long]).map((l) => l.id)).toEqual([1, 2, 3]);
  });

  it("keeps insertion order for undated legs and sinks them below dated ones", () => {
    const dreamA = leg({ id: 1, sortOrder: 0 });
    const dreamB = leg({ id: 2, sortOrder: 1 });
    const dated = leg({ id: 3, sortOrder: 2, startDate: "2026-09-01", endDate: "2026-09-02" });
    expect(sortLegs([dreamA, dreamB, dated]).map((l) => l.id)).toEqual([3, 1, 2]);
  });

  it("puts a leg with a start date but no end before one starting later", () => {
    const open = leg({ id: 1, sortOrder: 1, startDate: "2026-09-01", endDate: null });
    const closed = leg({ id: 2, sortOrder: 0, startDate: "2026-09-02", endDate: "2026-09-03" });
    expect(sortLegs([closed, open]).map((l) => l.id)).toEqual([1, 2]);
  });
});
