import { describe, expect, it } from "vitest";
import { bookingCategory, burnRate, rollupBudget, rollupByCategory, tripTotal } from "../budget";

describe("rollupByCategory with mixed currencies", () => {
  // Expenses always carry a `homeAmount` frozen at entry-time FX rate (see fx.ts) —
  // rollups only ever sum already-converted home-currency amounts, never raw entry amounts.
  const planned = { food: 400, lodging: 1000 };
  const expenses = [
    { category: "food", homeAmount: 43.2 }, // was €40 at 1.08
    { category: "food", homeAmount: 22.0 }, // was £17 at 1.29
    { category: "lodging", homeAmount: 900 },
  ];

  it("sums actuals per category regardless of original currency", () => {
    const rollup = rollupByCategory(planned, expenses);
    const food = rollup.find((r) => r.category === "food")!;
    expect(food.actual).toBeCloseTo(65.2);
    expect(food.planned).toBe(400);
  });

  it("includes categories with actuals but no planned budget", () => {
    const rollup = rollupByCategory({}, [{ category: "shopping", homeAmount: 50 }]);
    expect(rollup).toEqual([{ category: "shopping", planned: 0, actual: 50 }]);
  });

  it("rolls up to a trip total", () => {
    const rollup = rollupByCategory(planned, expenses);
    const total = tripTotal(rollup);
    expect(total.planned).toBe(1400);
    expect(total.actual).toBeCloseTo(965.2);
  });
});

describe("bookingCategory", () => {
  it("maps booking types onto expense categories", () => {
    expect(bookingCategory("flight")).toBe("flights");
    expect(bookingCategory("hotel")).toBe("lodging");
    expect(bookingCategory("train")).toBe("transit");
    expect(bookingCategory("car")).toBe("transit");
    expect(bookingCategory("restaurant")).toBe("food");
    expect(bookingCategory("event")).toBe("activities");
    expect(bookingCategory("activity")).toBe("activities");
  });
  it("falls back to 'other' for anything unknown", () => {
    expect(bookingCategory("spaceship")).toBe("other");
  });
});

describe("rollupBudget", () => {
  // hotel: estimated 2000 → actual 1700; a booking-only flight actual; an
  // estimate-only sightseeing line still unresolved.
  const lines = [
    { category: "lodging", legId: 1, estimatedHome: 2000, actualHome: 1700 },
    { category: "flights", legId: null, estimatedHome: null, actualHome: 480 },
    { category: "activities", legId: 1, estimatedHome: 150, actualHome: null },
  ];

  it("computes current as actual-where-known, else estimate", () => {
    const r = rollupBudget(lines);
    // 1700 (actual) + 480 (actual) + 150 (estimate) = 2330
    expect(r.grand.current).toBe(2330);
    expect(r.grand.estimated).toBe(2150);
    expect(r.grand.actual).toBe(2180);
  });

  it("variance sums only lines that have both estimate and actual", () => {
    // only the lodging line qualifies: 1700 − 2000 = −300
    expect(rollupBudget(lines).grand.variance).toBe(-300);
  });

  it("counts estimate-only lines as unresolved", () => {
    expect(rollupBudget(lines).unresolvedCount).toBe(1);
  });

  it("groups by category and by leg", () => {
    const r = rollupBudget(lines);
    expect(r.byCategory.find((c) => c.category === "lodging")!.current).toBe(1700);
    expect(r.byLeg.find((l) => l.legId === 1)!.current).toBe(1850); // 1700 + 150
    expect(r.byLeg.find((l) => l.legId === null)!.current).toBe(480);
  });
});

describe("burnRate", () => {
  it("reports under-plan when spend trails the expected pace", () => {
    // day 4 of 8 → linear expectation is $1000; $800 spent trails that pace
    const r = burnRate(800, 2000, 4, 8);
    expect(r.status).toBe("under");
    expect(r.percentOffPlan).toBeGreaterThan(0);
  });

  it("reports over-plan when spend exceeds the expected pace", () => {
    const r = burnRate(1800, 2000, 4, 8);
    expect(r.status).toBe("over");
  });
});
