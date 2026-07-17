export interface ExpenseLike {
  category: string;
  homeAmount: number;
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
