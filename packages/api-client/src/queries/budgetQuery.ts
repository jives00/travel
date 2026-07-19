import { queryOptions } from "@tanstack/react-query";
import type { createExpensesEndpoints } from "../endpoints/expenses";

export function createBudgetQueries(expenses: ReturnType<typeof createExpensesEndpoints>) {
  return {
    expensesQuery: (tripId: number) =>
      queryOptions({
        queryKey: ["expenses", tripId] as const,
        queryFn: () => expenses.list(tripId),
      }),
    // The rollup also folds in booking prices, so invalidate this key on booking
    // mutations too (a linked booking's price drives a line's actual).
    budgetQuery: (tripId: number) =>
      queryOptions({
        queryKey: ["budget", tripId] as const,
        queryFn: () => expenses.budget(tripId),
      }),
  };
}
