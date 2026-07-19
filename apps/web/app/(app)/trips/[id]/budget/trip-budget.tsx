"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BudgetLine,
  CreateExpenseBody,
  Expense,
  ExpenseCategory,
} from "@travel/types";
import { EXPENSE_CATEGORIES, enumLabel } from "@travel/core";
import { travelApi } from "@/lib/api";
import { Modal } from "../trip-itinerary";

// Full literal Tailwind classes per category (not interpolated — the scanner
// only sees complete class strings). Flights has no dedicated token, so it
// borrows transit's hue.
const CATEGORY_BAR: Record<ExpenseCategory, string> = {
  flights: "bg-category-transit",
  lodging: "bg-category-lodging",
  food: "bg-category-food",
  activities: "bg-category-activity",
  transit: "bg-category-transit",
  shopping: "bg-category-shopping",
  other: "bg-category-other",
};

function categoryIcon(cat: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.key === cat)?.iconName ?? "receipt_long";
}

function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${Math.round(n).toLocaleString()} ${currency}`;
  }
}

function moneyExact(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

// The API throws ApiError whose message is the raw response body — a JSON
// `{ "error": "..." }` for our 4xx replies. Surface just the message.
function errorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    const parsed = JSON.parse(raw) as { error?: string };
    return parsed.error ?? raw;
  } catch {
    return raw;
  }
}

type Grouping = "category" | "leg";

export function TripBudget({ tripId }: { tripId: number }) {
  const queryClient = useQueryClient();
  const { data: trip } = useQuery(travelApi.queries.tripQuery(tripId));
  const { data: budget } = useQuery(travelApi.queries.budgetQuery(tripId));
  const { data: expenses } = useQuery(travelApi.queries.expensesQuery(tripId));
  const { data: bookings } = useQuery(travelApi.queries.bookingsQuery(tripId));

  const [grouping, setGrouping] = useState<Grouping>("category");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  const legName = useMemo(() => {
    const map = new Map<number, string>();
    for (const l of trip?.legs ?? []) map.set(l.id, l.city);
    return (legId: number | null) => (legId == null ? "Unassigned" : (map.get(legId) ?? `City ${legId}`));
  }, [trip]);

  const expenseById = useMemo(() => {
    const map = new Map<number, Expense>();
    for (const e of expenses ?? []) map.set(e.id, e);
    return map;
  }, [expenses]);

  async function refresh() {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["budget", tripId] }),
      queryClient.invalidateQueries({ queryKey: ["expenses", tripId] }),
    ]);
  }

  async function removeExpense(expenseId: number) {
    await travelApi.expenses.remove(tripId, expenseId);
    await refresh();
  }

  if (!trip || !budget) return null;

  const home = budget.homeCurrency;
  const { grand } = budget;
  const maxCurrent = Math.max(1, ...budget.byCategory.map((c) => c.current), ...budget.byLeg.map((l) => l.current));

  const rollups: { key: string; label: string; icon?: string; barClass: string; current: number; estimated: number; actual: number }[] =
    grouping === "category"
      ? [...budget.byCategory]
          .sort((a, b) => b.current - a.current)
          .map((c) => ({
            key: c.category,
            label: enumLabel(EXPENSE_CATEGORIES, c.category),
            icon: categoryIcon(c.category),
            barClass: CATEGORY_BAR[c.category],
            current: c.current,
            estimated: c.estimated,
            actual: c.actual,
          }))
      : [...budget.byLeg]
          .sort((a, b) => b.current - a.current)
          .map((l) => ({
            key: String(l.legId),
            label: legName(l.legId),
            barClass: "bg-category-transit",
            current: l.current,
            estimated: l.estimated,
            actual: l.actual,
          }));

  // Lines grouped for the list, honoring the same toggle.
  const groups = new Map<string, { label: string; lines: BudgetLine[] }>();
  for (const line of budget.lines) {
    const key = grouping === "category" ? line.category : String(line.legId);
    const label = grouping === "category" ? enumLabel(EXPENSE_CATEGORIES, line.category) : legName(line.legId);
    if (!groups.has(key)) groups.set(key, { label, lines: [] });
    groups.get(key)!.lines.push(line);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href={`/trips/${tripId}`} className="text-sm text-text-secondary hover:text-text-primary">
            ← {trip.name}
          </Link>
          <h1 className="text-2xl font-bold text-text-primary">Budget</h1>
        </div>
        <button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
          className="rounded bg-category-transit px-3 py-2 text-sm font-medium text-white"
        >
          + Add expense
        </button>
      </div>

      {/* Headline totals */}
      <section className="rounded border border-gridline bg-surface p-5">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="text-sm uppercase tracking-wide text-text-muted">Projected total</div>
            <div className="text-4xl font-bold text-text-primary">{money(grand.current, home)}</div>
            <div className="mt-1 text-xs text-text-muted">
              Best-known cost — actuals where recorded, estimates otherwise · {home}
            </div>
          </div>
          <div className="flex gap-6 text-sm">
            <div>
              <div className="text-text-muted">Estimated</div>
              <div className="font-semibold text-text-primary">{money(grand.estimated, home)}</div>
            </div>
            <div>
              <div className="text-text-muted">Actual</div>
              <div className="font-semibold text-text-primary">{money(grand.actual, home)}</div>
            </div>
            <div>
              <div className="text-text-muted">Variance</div>
              <VarianceText value={grand.variance} currency={home} />
            </div>
          </div>
        </div>
        {budget.unresolvedCount > 0 && (
          <div className="mt-4 inline-flex items-center gap-2 rounded bg-status-warning/15 px-3 py-1 text-sm text-status-warning">
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              pending
            </span>
            {budget.unresolvedCount} line{budget.unresolvedCount === 1 ? "" : "s"} still estimate-only
          </div>
        )}
      </section>

      {/* Grouping toggle */}
      <div className="flex gap-2">
        {(["category", "leg"] as const).map((g) => (
          <button
            key={g}
            onClick={() => setGrouping(g)}
            className={`rounded px-3 py-1 text-sm ${
              grouping === g ? "bg-category-transit text-white" : "border border-gridline text-text-secondary"
            }`}
          >
            {g === "category" ? "By category" : "By city"}
          </button>
        ))}
      </div>

      {/* Rollup bars */}
      <section className="space-y-2">
        {rollups.map((r) => (
          <div key={r.key} className="rounded border border-gridline bg-surface p-3">
            <div className="mb-1 flex items-center justify-between text-sm">
              <span className="flex items-center gap-2 font-medium text-text-primary">
                {r.icon && (
                  <span className="material-symbols-outlined text-base text-text-muted" aria-hidden="true">
                    {r.icon}
                  </span>
                )}
                {r.label}
              </span>
              <span className="font-semibold text-text-primary">{money(r.current, home)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded bg-page">
              <div className={`h-full ${r.barClass}`} style={{ width: `${(r.current / maxCurrent) * 100}%` }} />
            </div>
          </div>
        ))}
        {rollups.length === 0 && (
          <p className="rounded border border-dashed border-gridline p-6 text-center text-sm text-text-muted">
            No expenses yet. Add one, or bookings with a price will appear here automatically.
          </p>
        )}
      </section>

      {/* Line list */}
      <section className="space-y-4">
        {[...groups.values()].map((group) => (
          <div key={group.label}>
            <h2 className="mb-2 text-sm font-semibold uppercase text-text-muted">{group.label}</h2>
            <div className="divide-y divide-gridline rounded border border-gridline">
              {group.lines.map((line) => (
                <BudgetLineRow
                  key={line.key}
                  line={line}
                  home={home}
                  onEdit={
                    line.source === "manual" && line.expenseId != null
                      ? () => {
                          const e = expenseById.get(line.expenseId!);
                          if (e) {
                            setEditing(e);
                            setFormOpen(true);
                          }
                        }
                      : undefined
                  }
                  onDelete={
                    line.source === "manual" && line.expenseId != null
                      ? () => removeExpense(line.expenseId!)
                      : undefined
                  }
                />
              ))}
            </div>
          </div>
        ))}
      </section>

      {formOpen && (
        <ExpenseForm
          tripId={tripId}
          home={home}
          editing={editing}
          legs={trip.legs.map((l) => ({ id: l.id, city: l.city }))}
          bookings={(bookings ?? [])
            .filter((b) => b.price != null)
            .map((b) => ({ id: b.id, title: b.title, price: b.price!, currency: b.currency }))}
          onClose={() => setFormOpen(false)}
          onSaved={async () => {
            setFormOpen(false);
            await refresh();
          }}
        />
      )}
    </div>
  );
}

function VarianceText({ value, currency }: { value: number; currency: string }) {
  if (value === 0) return <div className="font-semibold text-text-muted">—</div>;
  const over = value > 0;
  return (
    <div className={`font-semibold ${over ? "text-status-critical" : "text-status-good"}`}>
      {over ? "+" : "−"}
      {money(Math.abs(value), currency)}
      <span className="ml-1 text-xs font-normal">{over ? "over" : "under"}</span>
    </div>
  );
}

function BudgetLineRow({
  line,
  home,
  onEdit,
  onDelete,
}: {
  line: BudgetLine;
  home: string;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center gap-3 p-3">
      <span className="material-symbols-outlined text-lg text-text-muted" aria-hidden="true">
        {categoryIcon(line.category)}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate font-medium text-text-primary">{line.label}</span>
          {line.source === "booking" && (
            <span className="rounded bg-page px-1.5 py-0.5 text-[10px] uppercase text-text-muted">Booking</span>
          )}
          {line.unresolved && (
            <span className="rounded bg-status-warning/15 px-1.5 py-0.5 text-[10px] uppercase text-status-warning">
              Estimate
            </span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-text-muted">
          {line.estimateHome != null && (
            <span>est {moneyExact(line.estimateHome, home)}</span>
          )}
          {line.estimateHome != null && line.actualHome != null && <span> · </span>}
          {line.actualHome != null && (
            <span>
              actual {moneyExact(line.actualHome, home)}
              {line.actualFromBooking && " (via booking)"}
              {line.actualCurrency && line.actualCurrency !== home && line.actualAmount != null && (
                <span className="text-text-muted"> — {moneyExact(line.actualAmount, line.actualCurrency)}</span>
              )}
            </span>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className="font-semibold text-text-primary">
          {moneyExact(line.actualHome ?? line.estimateHome ?? 0, home)}
        </div>
        {(onEdit || onDelete) && (
          <div className="mt-1 flex justify-end gap-2 text-xs">
            {onEdit && (
              <button onClick={onEdit} className="text-text-secondary hover:text-text-primary">
                Edit
              </button>
            )}
            {onDelete && (
              <button onClick={onDelete} className="text-text-muted hover:text-status-critical">
                Delete
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface FormState {
  category: ExpenseCategory;
  label: string;
  legId: string;
  estAmount: string;
  estCurrency: string;
  actualMode: "none" | "typed" | "booking";
  actAmount: string;
  actCurrency: string;
  actualBookingId: string;
  notes: string;
}

function expenseToForm(e: Expense, home: string): FormState {
  return {
    category: e.category,
    label: e.label,
    legId: e.legId != null ? String(e.legId) : "",
    estAmount: e.estimate ? String(e.estimate.amount) : "",
    estCurrency: e.estimate?.currency ?? home,
    actualMode: e.actualBookingId != null ? "booking" : e.actual ? "typed" : "none",
    actAmount: e.actual ? String(e.actual.amount) : "",
    actCurrency: e.actual?.currency ?? home,
    actualBookingId: e.actualBookingId != null ? String(e.actualBookingId) : "",
    notes: e.notes ?? "",
  };
}

function ExpenseForm({
  tripId,
  home,
  editing,
  legs,
  bookings,
  onClose,
  onSaved,
}: {
  tripId: number;
  home: string;
  editing: Expense | null;
  legs: { id: number; city: string }[];
  bookings: { id: number; title: string; price: number; currency: string | null }[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    editing
      ? expenseToForm(editing, home)
      : {
          category: "other",
          label: "",
          legId: "",
          estAmount: "",
          estCurrency: home,
          actualMode: "none",
          actAmount: "",
          actCurrency: home,
          actualBookingId: "",
          notes: "",
        },
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));

  function buildBody(): CreateExpenseBody {
    const body: CreateExpenseBody = {
      category: form.category,
      label: form.label.trim(),
      legId: form.legId ? Number(form.legId) : null,
      notes: form.notes.trim() || null,
      estimate: form.estAmount ? { amount: Number(form.estAmount), currency: form.estCurrency } : null,
    };
    if (form.actualMode === "booking" && form.actualBookingId) {
      body.actualBookingId = Number(form.actualBookingId);
      body.actual = null;
    } else if (form.actualMode === "typed" && form.actAmount) {
      body.actual = { amount: Number(form.actAmount), currency: form.actCurrency };
      body.actualBookingId = null;
    } else {
      body.actual = null;
      body.actualBookingId = null;
    }
    return body;
  }

  async function save() {
    if (!form.label.trim()) {
      setError("Give the expense a label.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const body = buildBody();
      if (editing) await travelApi.expenses.update(tripId, editing.id, body);
      else await travelApi.expenses.create(tripId, body);
      onSaved();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setSaving(false);
    }
  }

  const inputClass = "w-full rounded border border-gridline bg-transparent p-2 text-text-primary";

  return (
    <Modal onClose={onClose}>
      <h2 className="mb-3 text-lg font-semibold text-text-primary">{editing ? "Edit expense" : "Add expense"}</h2>
      <div className="space-y-3">
        <input
          autoFocus
          className={inputClass}
          placeholder="Label (e.g. Hotel Arts, dinner, museum tickets)"
          value={form.label}
          onChange={(e) => set({ label: e.target.value })}
        />

        <div className="flex gap-2">
          <select
            className={inputClass}
            value={form.category}
            onChange={(e) => set({ category: e.target.value as ExpenseCategory })}
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <select className={inputClass} value={form.legId} onChange={(e) => set({ legId: e.target.value })}>
            <option value="">No city</option>
            {legs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.city}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-xs uppercase text-text-muted">Estimate</label>
          <div className="mt-1 flex gap-2">
            <input
              className="w-2/3 rounded border border-gridline bg-transparent p-2 text-text-primary"
              placeholder="Amount"
              inputMode="decimal"
              value={form.estAmount}
              onChange={(e) => set({ estAmount: e.target.value })}
            />
            <input
              className="w-1/3 rounded border border-gridline bg-transparent p-2 text-text-primary"
              placeholder="USD"
              maxLength={3}
              value={form.estCurrency}
              onChange={(e) => set({ estCurrency: e.target.value.toUpperCase() })}
            />
          </div>
        </div>

        <div>
          <label className="text-xs uppercase text-text-muted">Actual</label>
          <div className="mt-1 flex gap-2 text-sm">
            {(["none", "typed", "booking"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => set({ actualMode: m })}
                className={`rounded px-2 py-1 ${
                  form.actualMode === m ? "bg-category-transit text-white" : "border border-gridline text-text-secondary"
                }`}
              >
                {m === "none" ? "Not yet" : m === "typed" ? "Enter amount" : "Link booking"}
              </button>
            ))}
          </div>
          {form.actualMode === "typed" && (
            <div className="mt-2 flex gap-2">
              <input
                className="w-2/3 rounded border border-gridline bg-transparent p-2 text-text-primary"
                placeholder="Amount"
                inputMode="decimal"
                value={form.actAmount}
                onChange={(e) => set({ actAmount: e.target.value })}
              />
              <input
                className="w-1/3 rounded border border-gridline bg-transparent p-2 text-text-primary"
                placeholder="USD"
                maxLength={3}
                value={form.actCurrency}
                onChange={(e) => set({ actCurrency: e.target.value.toUpperCase() })}
              />
            </div>
          )}
          {form.actualMode === "booking" && (
            <select
              className={`${inputClass} mt-2`}
              value={form.actualBookingId}
              onChange={(e) => set({ actualBookingId: e.target.value })}
            >
              <option value="">Select a booking…</option>
              {bookings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title} — {moneyExact(b.price, b.currency ?? home)}
                </option>
              ))}
            </select>
          )}
          {form.actualMode === "booking" && bookings.length === 0 && (
            <p className="mt-1 text-xs text-text-muted">No bookings with a price on this trip yet.</p>
          )}
        </div>

        <textarea
          className={inputClass}
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => set({ notes: e.target.value })}
        />

        {error && <p className="text-sm text-status-critical">{error}</p>}
      </div>

      <div className="mt-4 flex justify-end gap-3">
        <button onClick={onClose} className="text-sm text-text-secondary">
          Cancel
        </button>
        <button
          onClick={save}
          disabled={saving}
          className="rounded bg-category-transit px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </Modal>
  );
}
