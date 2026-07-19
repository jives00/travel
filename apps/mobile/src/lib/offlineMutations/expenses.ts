import { useMutation } from "@tanstack/react-query";
import type { BudgetSummary, CreateExpenseBody, Expense, UpdateExpenseBody } from "@travel/types";
import { rollupBudget, type BudgetInputLine } from "@travel/core";
import { travelApi } from "../api";
import { queryClient } from "../queryClient";
import { nextTempId, registerOfflineMutation, resolveId } from "../mutations";

export const EXPENSE_CREATE = ["expenses", "create"] as const;
export const EXPENSE_UPDATE = ["expenses", "update"] as const;
export const EXPENSE_REMOVE = ["expenses", "remove"] as const;

/** Rewrite any temp-id references a body picked up while offline (the trip, a
 * just-created city, or a just-created booking used as the actual). */
function resolveBodyRefs<T extends CreateExpenseBody | UpdateExpenseBody>(body: T): T {
  return {
    ...body,
    legId: body.legId != null ? resolveId(body.legId) : body.legId,
    actualBookingId: body.actualBookingId != null ? resolveId(body.actualBookingId) : body.actualBookingId,
  };
}

export function registerExpenseMutations(): void {
  registerOfflineMutation<{ tripId: number; body: CreateExpenseBody; tempId: number }, Expense>({
    mutationKey: EXPENSE_CREATE,
    resolveRefs: (v) => ({ ...v, tripId: resolveId(v.tripId), body: resolveBodyRefs(v.body) }),
    mutationFn: ({ tripId, body }) => travelApi.expenses.create(tripId, body),
    tempIdOf: (v) => v.tempId,
    realIdOf: (e) => e.id,
  });
  registerOfflineMutation<{ tripId: number; expenseId: number; body: UpdateExpenseBody }, Expense>({
    mutationKey: EXPENSE_UPDATE,
    resolveRefs: (v) => ({ ...v, tripId: resolveId(v.tripId), expenseId: resolveId(v.expenseId), body: resolveBodyRefs(v.body) }),
    mutationFn: ({ tripId, expenseId, body }) => travelApi.expenses.update(tripId, expenseId, body),
  });
  registerOfflineMutation<{ tripId: number; expenseId: number }, void>({
    mutationKey: EXPENSE_REMOVE,
    resolveRefs: (v) => ({ tripId: resolveId(v.tripId), expenseId: resolveId(v.expenseId) }),
    mutationFn: ({ tripId, expenseId }) => travelApi.expenses.remove(tripId, expenseId),
  });
}

function invalidate(tripId: number): void {
  const id = resolveId(tripId);
  void queryClient.invalidateQueries({ queryKey: ["budget", id] });
  void queryClient.invalidateQueries({ queryKey: ["expenses", id] });
}

export function useCreateExpense(tripId: number) {
  const m = useMutation<Expense, Error, { tripId: number; body: CreateExpenseBody; tempId: number }>({
    mutationKey: EXPENSE_CREATE,
    onSettled: (_d, _e, v) => invalidate(v.tripId),
  });
  return { ...m, create: (body: CreateExpenseBody) => m.mutate({ tripId, body, tempId: nextTempId() }) };
}

export function useUpdateExpense(tripId: number) {
  const m = useMutation<Expense, Error, { tripId: number; expenseId: number; body: UpdateExpenseBody }>({
    mutationKey: EXPENSE_UPDATE,
    onSettled: (_d, _e, v) => invalidate(v.tripId),
  });
  return { ...m, update: (expenseId: number, body: UpdateExpenseBody) => m.mutate({ tripId, expenseId, body }) };
}

export function useRemoveExpense(tripId: number) {
  return useMutation<void, Error, { expenseId: number }>({
    mutationKey: EXPENSE_REMOVE,
    // Optimistically drop the line from the cached summary so it disappears
    // immediately even offline (the rollup is re-derived locally from the
    // remaining lines with the same core helper the server uses).
    onMutate: ({ expenseId }) => {
      const key = ["budget", resolveId(tripId)] as const;
      const prev = queryClient.getQueryData<BudgetSummary>(key);
      if (prev) {
        const lines = prev.lines.filter((l) => l.key !== `expense:${expenseId}`);
        queryClient.setQueryData<BudgetSummary>(key, recomputeSummary(prev, lines));
      }
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      const c = ctx as { prev?: BudgetSummary } | undefined;
      if (c?.prev) queryClient.setQueryData(["budget", resolveId(tripId)], c.prev);
    },
    onSettled: () => invalidate(tripId),
  });
}

/** Re-derive the rollups from a filtered line set, reusing core's rollupBudget so
 * the optimistic result matches what the server will return on refetch. */
function recomputeSummary(summary: BudgetSummary, lines: BudgetSummary["lines"]): BudgetSummary {
  const inputs: BudgetInputLine[] = lines.map((l) => ({
    category: l.category,
    legId: l.legId,
    estimatedHome: l.estimateHome,
    actualHome: l.actualHome,
  }));
  const r = rollupBudget(inputs);
  return {
    ...summary,
    lines,
    grand: r.grand,
    byCategory: r.byCategory as BudgetSummary["byCategory"],
    byLeg: r.byLeg,
    unresolvedCount: r.unresolvedCount,
  };
}
