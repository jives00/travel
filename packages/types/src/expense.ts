import { z } from "zod";
import { CurrencyCode } from "./common";

/** Budget categories — mirrors packages/core's EXPENSE_CATEGORIES (the source of
 * truth for label/icon; this is just the value set). Kept separate from
 * PlaceCategory/BookingType: budget needs "flights", places don't. */
export const ExpenseCategory = z.enum([
  "flights",
  "lodging",
  "food",
  "activities",
  "transit",
  "shopping",
  "other",
]);
export type ExpenseCategory = z.infer<typeof ExpenseCategory>;

/** One money side of an expense (an estimate or an actual), as stored: the
 * entered amount + currency plus the FX rate and home-currency amount frozen at
 * entry time (see packages/core/fx.ts — never re-converted later). */
export const ExpenseMoney = z.object({
  amount: z.number(),
  currency: z.string().length(3),
  fxRate: z.number(),
  homeAmount: z.number(),
});
export type ExpenseMoney = z.infer<typeof ExpenseMoney>;

export const Expense = z.object({
  id: z.number().int(),
  tripId: z.number().int(),
  legId: z.number().int().nullable(),
  category: ExpenseCategory,
  label: z.string(),
  // Both nullable — a line can be estimate-only (not yet booked), actual-only
  // (a cost with no prior estimate), or both. `actual` is the *typed* actual;
  // when `actualBookingId` is set the actual is derived live from that booking's
  // price instead and this stays null.
  estimate: ExpenseMoney.nullable(),
  actual: ExpenseMoney.nullable(),
  actualBookingId: z.number().int().nullable(),
  homeCurrency: z.string().length(3),
  placeId: z.number().int().nullable(),
  itineraryItemId: z.number().int().nullable(),
  notes: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type Expense = z.infer<typeof Expense>;

/** Client sends only entered amount + currency per side; the server fetches the
 * FX rate and computes fxRate/homeAmount. `null` for a side clears it. */
const ExpenseMoneyInput = z.object({
  amount: z.number(),
  currency: CurrencyCode,
});

export const CreateExpenseBody = z.object({
  category: ExpenseCategory,
  label: z.string().min(1),
  legId: z.number().int().nullable().optional(),
  placeId: z.number().int().nullable().optional(),
  itineraryItemId: z.number().int().nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
  estimate: ExpenseMoneyInput.nullable().optional(),
  // Typed actual. Mutually exclusive with actualBookingId — if a booking is
  // linked, the server ignores a typed actual (linked booking wins).
  actual: ExpenseMoneyInput.nullable().optional(),
  actualBookingId: z.number().int().nullable().optional(),
});
export type CreateExpenseBody = z.infer<typeof CreateExpenseBody>;

export const UpdateExpenseBody = CreateExpenseBody.partial();
export type UpdateExpenseBody = z.infer<typeof UpdateExpenseBody>;

// ---- Budget summary (GET /:tripId/budget) -------------------------------

/** All amounts are in the trip's home currency. `current` = actual where known,
 * else estimate (best-known cost). `variance` sums actual − estimate only over
 * lines that have both. */
export const BudgetTotals = z.object({
  estimated: z.number(),
  actual: z.number(),
  current: z.number(),
  variance: z.number(),
});
export type BudgetTotals = z.infer<typeof BudgetTotals>;

export const BudgetCategoryRollup = BudgetTotals.extend({ category: ExpenseCategory });
export type BudgetCategoryRollup = z.infer<typeof BudgetCategoryRollup>;

export const BudgetLegRollup = BudgetTotals.extend({ legId: z.number().int().nullable() });
export type BudgetLegRollup = z.infer<typeof BudgetLegRollup>;

/** A unified budget line for display — either a manual expense or a priced
 * booking not linked to any expense (source `booking`, read-only). */
export const BudgetLine = z.object({
  key: z.string(), // "expense:12" | "booking:5" — stable React key
  source: z.enum(["manual", "booking"]),
  expenseId: z.number().int().nullable(),
  bookingId: z.number().int().nullable(),
  category: ExpenseCategory,
  legId: z.number().int().nullable(),
  label: z.string(),
  estimateAmount: z.number().nullable(),
  estimateCurrency: z.string().nullable(),
  estimateHome: z.number().nullable(),
  actualAmount: z.number().nullable(),
  actualCurrency: z.string().nullable(),
  actualHome: z.number().nullable(),
  // Actual came from a linked booking's price (live), not a typed value.
  actualFromBooking: z.boolean(),
  // Has an estimate but no actual yet — the "still just a guess" flag.
  unresolved: z.boolean(),
});
export type BudgetLine = z.infer<typeof BudgetLine>;

export const BudgetSummary = z.object({
  homeCurrency: z.string(),
  grand: BudgetTotals,
  byCategory: z.array(BudgetCategoryRollup),
  byLeg: z.array(BudgetLegRollup),
  unresolvedCount: z.number().int(),
  lines: z.array(BudgetLine),
});
export type BudgetSummary = z.infer<typeof BudgetSummary>;
