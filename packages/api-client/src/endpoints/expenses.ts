import type { BudgetSummary, CreateExpenseBody, Expense, UpdateExpenseBody } from "@travel/types";
import type { createApiClient } from "../client";

type RequestFn = ReturnType<typeof createApiClient>["request"];

export function createExpensesEndpoints(request: RequestFn) {
  return {
    list: (tripId: number) => request<Expense[]>(`/api/trips/${tripId}/expenses`),
    budget: (tripId: number) => request<BudgetSummary>(`/api/trips/${tripId}/budget`),
    create: (tripId: number, body: CreateExpenseBody) =>
      request<Expense>(`/api/trips/${tripId}/expenses`, { method: "POST", body }),
    update: (tripId: number, expenseId: number, body: UpdateExpenseBody) =>
      request<Expense>(`/api/trips/${tripId}/expenses/${expenseId}`, { method: "PATCH", body }),
    remove: (tripId: number, expenseId: number) =>
      request<void>(`/api/trips/${tripId}/expenses/${expenseId}`, { method: "DELETE" }),
  };
}
