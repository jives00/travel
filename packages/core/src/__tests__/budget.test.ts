import { describe, expect, it } from "vitest";
import { burnRate, rollupByCategory, tripTotal } from "../budget";

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
