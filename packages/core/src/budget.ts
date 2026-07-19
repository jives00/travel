export interface ExpenseLike {
  category: string;
  homeAmount: number;
}

/** Maps a booking's `type` onto a budget `ExpenseCategory` so a priced booking
 * can be rolled up under the right heading. Keyed by @travel/types BookingType;
 * kept here (not in the enum tables) because it's the budget domain's concern. */
export const BOOKING_TYPE_TO_EXPENSE_CATEGORY: Record<string, string> = {
  flight: "flights",
  hotel: "lodging",
  train: "transit",
  car: "transit",
  restaurant: "food",
  event: "activities",
  activity: "activities",
};

export function bookingCategory(bookingType: string): string {
  return BOOKING_TYPE_TO_EXPENSE_CATEGORY[bookingType] ?? "other";
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** A budget line reduced to just the home-currency numbers the rollup needs.
 * `estimatedHome`/`actualHome` are already converted (frozen at entry for typed
 * values, or converted at read-time for booking-derived actuals). */
export interface BudgetInputLine {
  category: string;
  legId: number | null;
  estimatedHome: number | null;
  actualHome: number | null;
}

export interface BudgetTotals {
  estimated: number;
  actual: number;
  current: number; // actual where present, else estimate
  variance: number; // sum(actual − estimate) over lines having both
}

function emptyTotals(): BudgetTotals {
  return { estimated: 0, actual: 0, current: 0, variance: 0 };
}

function accumulate(t: BudgetTotals, line: BudgetInputLine): void {
  const est = line.estimatedHome;
  const act = line.actualHome;
  if (est != null) t.estimated += est;
  if (act != null) t.actual += act;
  t.current += act ?? est ?? 0;
  if (est != null && act != null) t.variance += act - est;
}

function roundTotals(t: BudgetTotals): BudgetTotals {
  return {
    estimated: round2(t.estimated),
    actual: round2(t.actual),
    current: round2(t.current),
    variance: round2(t.variance),
  };
}

export interface BudgetRollup {
  grand: BudgetTotals;
  byCategory: (BudgetTotals & { category: string })[];
  byLeg: (BudgetTotals & { legId: number | null })[];
  /** Lines with an estimate but no actual — the "still just a guess" count. */
  unresolvedCount: number;
}

/** The whole budget in one pass: grand total, per-category, and per-leg rollups,
 * plus how many lines are still estimate-only. */
export function rollupBudget(lines: BudgetInputLine[]): BudgetRollup {
  const grand = emptyTotals();
  const byCategory = new Map<string, BudgetTotals>();
  const byLeg = new Map<number | null, BudgetTotals>();
  let unresolvedCount = 0;

  for (const line of lines) {
    accumulate(grand, line);

    const cat = byCategory.get(line.category) ?? emptyTotals();
    accumulate(cat, line);
    byCategory.set(line.category, cat);

    const leg = byLeg.get(line.legId) ?? emptyTotals();
    accumulate(leg, line);
    byLeg.set(line.legId, leg);

    if (line.estimatedHome != null && line.actualHome == null) unresolvedCount += 1;
  }

  return {
    grand: roundTotals(grand),
    byCategory: [...byCategory.entries()].map(([category, t]) => ({ category, ...roundTotals(t) })),
    byLeg: [...byLeg.entries()].map(([legId, t]) => ({ legId, ...roundTotals(t) })),
    unresolvedCount,
  };
}

export interface CategoryRollup {
  category: string;
  planned: number;
  actual: number;
}

export function rollupByCategory(
  planned: Record<string, number>,
  expenses: ExpenseLike[],
): CategoryRollup[] {
  const actuals = new Map<string, number>();
  for (const e of expenses) {
    actuals.set(e.category, (actuals.get(e.category) ?? 0) + e.homeAmount);
  }
  const categories = new Set([...Object.keys(planned), ...actuals.keys()]);
  return [...categories].map((category) => ({
    category,
    planned: planned[category] ?? 0,
    actual: actuals.get(category) ?? 0,
  }));
}

export function tripTotal(rollup: CategoryRollup[]): { planned: number; actual: number } {
  return rollup.reduce(
    (acc, r) => ({ planned: acc.planned + r.planned, actual: acc.actual + r.actual }),
    { planned: 0, actual: 0 },
  );
}

/** "$1,240 of $2,000 · day 4 of 8 · running 8% under" */
export function burnRate(spentSoFar: number, plannedTotal: number, dayIndex: number, totalDays: number) {
  const expectedByNow = plannedTotal * (dayIndex / totalDays);
  const percentOffPlan = expectedByNow === 0 ? 0 : ((expectedByNow - spentSoFar) / expectedByNow) * 100;
  return {
    spentSoFar,
    plannedTotal,
    dayIndex,
    totalDays,
    percentOffPlan: Math.round(percentOffPlan),
    status: percentOffPlan >= 0 ? ("under" as const) : ("over" as const),
  };
}
