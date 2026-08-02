import { describe, expect, it } from "vitest";
import type { Leg } from "@travel/types";
import { addDays, buildTripDays } from "../tripDays";

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

describe("addDays", () => {
  it("crosses month and year boundaries", () => {
    expect(addDays("2026-03-30", 3)).toBe("2026-04-02");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-02", -1)).toBe("2026-03-01");
  });
});

describe("buildTripDays", () => {
  it("returns [] when no leg has real dates", () => {
    expect(buildTripDays([leg({ dayCount: 3 })])).toEqual([]);
  });

  it("numbers every day of a single leg", () => {
    const days = buildTripDays([leg({ startDate: "2026-03-03", endDate: "2026-03-05" })]);
    expect(days.map((d) => d.date)).toEqual(["2026-03-03", "2026-03-04", "2026-03-05"]);
    expect(days.map((d) => d.dayNumber)).toEqual([1, 2, 3]);
    expect(days.every((d) => d.city === "Madrid")).toBe(true);
  });

  it("fills gaps between legs with city-less days rather than dropping them", () => {
    const days = buildTripDays([
      leg({ id: 1, city: "Madrid", startDate: "2026-03-03", endDate: "2026-03-04" }),
      leg({ id: 2, city: "Lisbon", startDate: "2026-03-06", endDate: "2026-03-06" }),
    ]);
    expect(days).toHaveLength(4);
    expect(days.map((d) => d.city)).toEqual(["Madrid", "Madrid", null, "Lisbon"]);
    expect(days.map((d) => d.legId)).toEqual([1, 1, null, 2]);
  });

  it("accepts full ISO datetimes from MySQL DATE columns", () => {
    const days = buildTripDays([
      leg({ startDate: "2026-03-03T00:00:00.000Z", endDate: "2026-03-04T00:00:00.000Z" }),
    ]);
    expect(days.map((d) => d.date)).toEqual(["2026-03-03", "2026-03-04"]);
  });

  it("resolves an overlapping day to the first matching leg", () => {
    const days = buildTripDays([
      leg({ id: 1, city: "Madrid", startDate: "2026-03-03", endDate: "2026-03-05" }),
      leg({ id: 2, city: "Lisbon", startDate: "2026-03-05", endDate: "2026-03-06" }),
    ]);
    expect(days.find((d) => d.date === "2026-03-05")?.city).toBe("Madrid");
  });
});
