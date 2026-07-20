"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type {
  BudgetLine,
  CreateExpenseBody,
  Expense,
  ExpenseCategory,
} from "@travel/types";
import { EXPENSE_CATEGORIES, enumLabel } from "@travel/core";
import { travelApi } from "@/lib/api";
import { Modal } from "../trip-itinerary";

// Category → generated theme.css var (see packages/ui-tokens), so chart
// fills swap with light/dark automatically. Flights has no dedicated token,
// so it borrows transit's hue.
const CATEGORY_COLOR_VAR: Record<ExpenseCategory, string> = {
  flights: "--category-transit-rgb",
  lodging: "--category-lodging-rgb",
  food: "--category-food-rgb",
  activities: "--category-activity-rgb",
  transit: "--category-transit-rgb",
  shopping: "--category-shopping-rgb",
  other: "--category-other-rgb",
};
const rgbVar = (name: string) => `rgb(var(${name}))`;

// Fixed categorical slot order (blue/green/magenta/yellow/aqua/violet/red) —
// the same validated 8-hue palette as CATEGORY_COLORS, re-ordered for
// adjacent colorblind-safe contrast when used as an arbitrary (non-category)
// identity sequence. One slot per city, assigned by leg order — never by
// sorted rank — so a color stays tied to its city. Legs beyond the 7th slot
// fold into a shared muted color.
const CITY_COLOR_VARS = [
  "--category-transit-rgb",
  "--category-sight-rgb",
  "--category-other-rgb",
  "--category-shopping-rgb",
  "--category-activity-rgb",
  "--category-lodging-rgb",
  "--category-food-rgb",
];
const CITY_OVERFLOW_COLOR = "--chrome-text-muted-rgb";

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

  // City color stays tied to leg identity (trip.legs order), never to sorted
  // rank, so it doesn't repaint as amounts change.
  const cityColorByLeg = useMemo(() => {
    const map = new Map<string, string>();
    (trip?.legs ?? []).forEach((leg, i) => {
      map.set(String(leg.id), rgbVar(CITY_COLOR_VARS[i] ?? CITY_OVERFLOW_COLOR));
    });
    return (legId: number | null) => (legId == null ? rgbVar(CITY_OVERFLOW_COLOR) : (map.get(String(legId)) ?? rgbVar(CITY_OVERFLOW_COLOR)));
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

  const categoryChartData = [...budget.byCategory]
    .filter((c) => c.current > 0)
    .sort((a, b) => b.current - a.current)
    .map((c) => ({
      key: c.category,
      label: enumLabel(EXPENSE_CATEGORIES, c.category),
      current: c.current,
      color: rgbVar(CATEGORY_COLOR_VAR[c.category]),
    }));

  const cityChartData = [...budget.byLeg]
    .filter((l) => l.current > 0)
    .sort((a, b) => b.current - a.current)
    .map((l) => ({
      key: String(l.legId),
      label: legName(l.legId),
      current: l.current,
      color: cityColorByLeg(l.legId),
    }));

  // Lines grouped for the list, honoring the same toggle. Sorted
  // alphabetically by label, with the catch-all group ("Other" / "Unassigned")
  // pinned last regardless of where it falls alphabetically.
  const groups = new Map<string, { label: string; lines: BudgetLine[] }>();
  for (const line of budget.lines) {
    const key = grouping === "category" ? line.category : String(line.legId);
    const label = grouping === "category" ? enumLabel(EXPENSE_CATEGORIES, line.category) : legName(line.legId);
    if (!groups.has(key)) groups.set(key, { label, lines: [] });
    groups.get(key)!.lines.push(line);
  }
  const sortedGroups = [...groups.entries()]
    .sort(([keyA], [keyB]) => {
      const isCatchAllA = grouping === "category" ? keyA === "other" : keyA === "null";
      const isCatchAllB = grouping === "category" ? keyB === "other" : keyB === "null";
      if (isCatchAllA !== isCatchAllB) return isCatchAllA ? 1 : -1;
      return groups.get(keyA)!.label.localeCompare(groups.get(keyB)!.label);
    })
    .map(([, group]) => ({
      ...group,
      lines: [...group.lines].sort((a, b) => a.label.localeCompare(b.label)),
    }));

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

      {/* Charts + line items, side by side on wide screens */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        {/* Charts */}
        <div className="space-y-6">
          <ChartCard title="By category">
            <CategoryBarChart data={categoryChartData} home={home} />
          </ChartCard>
          <ChartCard title="By city">
            <CityPieChart data={cityChartData} home={home} />
          </ChartCard>
        </div>

        {/* Line items */}
        <div className="space-y-4">
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

          <section className="space-y-4">
            {sortedGroups.map((group) => (
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
            {groups.size === 0 && (
              <p className="rounded border border-dashed border-gridline p-6 text-center text-sm text-text-muted">
                No expenses yet. Add one, or bookings with a price will appear here automatically.
              </p>
            )}
          </section>
        </div>
      </div>

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

type ChartDatum = { key: string; label: string; current: number; color: string };

function ChartCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded border border-gridline bg-surface p-4">
      <h2 className="mb-3 text-sm font-semibold uppercase text-text-muted">{title}</h2>
      {children}
    </section>
  );
}

function EmptyChart() {
  return (
    <p className="py-6 text-center text-sm text-text-muted">Nothing to chart yet.</p>
  );
}

function ChartTooltip({
  active,
  payload,
  home,
}: {
  active?: boolean;
  payload?: { value?: number | string; payload: ChartDatum }[];
  home: string;
}) {
  if (!active || !payload?.length) return null;
  const entry = payload[0];
  const datum = entry.payload;
  return (
    <div className="rounded border border-gridline bg-surface px-3 py-2 text-sm shadow-sm">
      <div className="font-medium text-text-primary">{datum.label}</div>
      <div className="text-text-secondary">{moneyExact(Number(entry.value), home)}</div>
    </div>
  );
}

function CategoryBarChart({ data, home }: { data: ChartDatum[]; home: string }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <ResponsiveContainer width="100%" height={Math.max(120, data.length * 40)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, bottom: 4, left: 4 }} barCategoryGap={12}>
        <XAxis type="number" hide />
        <YAxis
          type="category"
          dataKey="label"
          width={100}
          tickLine={false}
          axisLine={false}
          tick={{ fill: "rgb(var(--chrome-text-secondary-rgb))", fontSize: 12 }}
        />
        <Tooltip
          content={(props: any) => <ChartTooltip {...props} home={home} />}
          cursor={{ fill: "rgb(var(--chrome-page-rgb))" }}
        />
        <Bar dataKey="current" maxBarSize={20} radius={[0, 4, 4, 0]} isAnimationActive={false}>
          {data.map((d) => (
            <Cell key={d.key} fill={d.color} />
          ))}
          <LabelList
            dataKey="current"
            position="right"
            formatter={(v: any) => money(Number(v), home)}
            style={{ fill: "rgb(var(--chrome-text-primary-rgb))", fontSize: 12, fontWeight: 600 }}
          />
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function CityPieChart({ data, home }: { data: ChartDatum[]; home: string }) {
  if (data.length === 0) return <EmptyChart />;
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
      <div className="mx-auto h-[200px] w-[200px] shrink-0 sm:mx-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Tooltip content={(props: any) => <ChartTooltip {...props} home={home} />} />
            <Pie
              data={data}
              dataKey="current"
              nameKey="label"
              innerRadius={48}
              outerRadius={90}
              paddingAngle={data.length > 1 ? 2 : 0}
              stroke="rgb(var(--chrome-surface-rgb))"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.key} fill={d.color} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="min-w-0 flex-1 space-y-1.5 text-sm">
        {data.map((d) => (
          <li key={d.key} className="flex items-center justify-between gap-2">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: d.color }} />
              <span className="truncate text-text-primary">{d.label}</span>
            </span>
            <span className="shrink-0 text-text-secondary">{money(d.current, home)}</span>
          </li>
        ))}
      </ul>
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
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save();
        }}
      >
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
          <button type="button" onClick={onClose} className="text-sm text-text-secondary">
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded bg-category-transit px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
