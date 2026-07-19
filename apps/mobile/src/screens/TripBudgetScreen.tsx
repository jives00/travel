import { useMemo, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { BudgetLine, CreateExpenseBody, Expense, ExpenseCategory } from "@travel/types";
import { EXPENSE_CATEGORIES, enumLabel } from "@travel/core";
import { travelApi } from "../lib/api";
import { useCreateExpense, useUpdateExpense, useRemoveExpense } from "../lib/offlineMutations/expenses";
import { Screen, Card, Button, SegmentedControl, TextField, Sheet } from "../components/ui";
import type { TripsScreenProps } from "../navigation/types";

const CATEGORY_BAR: Record<ExpenseCategory, string> = {
  flights: "bg-category-transit",
  lodging: "bg-category-lodging",
  food: "bg-category-food",
  activities: "bg-category-activity",
  transit: "bg-category-transit",
  shopping: "bg-category-shopping",
  other: "bg-category-other",
};

// The API client throws an Error whose message is the raw response body — a
// JSON `{ "error": "..." }` for our 4xx replies. Surface just the message.
function errorText(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  try {
    return (JSON.parse(raw) as { error?: string }).error ?? raw;
  } catch {
    return raw || "Something went wrong.";
  }
}

function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", { style: "currency", currency, maximumFractionDigits: 0 }).format(n);
  } catch {
    return `${currency} ${Math.round(n).toLocaleString()}`;
  }
}

type Grouping = "category" | "leg";

export function TripBudgetScreen({ route }: TripsScreenProps<"TripBudget">) {
  const { tripId } = route.params;
  const { data: trip } = useQuery(travelApi.queries.tripQuery(tripId));
  const budgetQuery = useQuery(travelApi.queries.budgetQuery(tripId));
  const budget = budgetQuery.data;
  const { data: expenses } = useQuery(travelApi.queries.expensesQuery(tripId));
  const { data: bookings } = useQuery(travelApi.queries.bookingsQuery(tripId));

  const [grouping, setGrouping] = useState<Grouping>("category");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);

  const removeExpense = useRemoveExpense(tripId);

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

  if (budgetQuery.isError) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <Text className="mb-1 text-base font-semibold text-text-primary dark:text-text-primary-dark">
            Couldn&apos;t load the budget
          </Text>
          <Text className="mb-4 text-center text-sm text-text-muted">
            {errorText(budgetQuery.error)}
          </Text>
          <Button title="Retry" onPress={() => budgetQuery.refetch()} />
        </View>
      </Screen>
    );
  }

  if (!trip || !budget) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator />
          <Text className="mt-2 text-text-muted">Loading budget…</Text>
        </View>
      </Screen>
    );
  }

  const home = budget.homeCurrency;
  const { grand } = budget;
  const rollupSource = grouping === "category" ? budget.byCategory : budget.byLeg;
  const maxCurrent = Math.max(1, ...rollupSource.map((r) => r.current));

  const rollups = (
    grouping === "category"
      ? [...budget.byCategory]
          .sort((a, b) => b.current - a.current)
          .map((c) => ({
            key: c.category as string,
            label: enumLabel(EXPENSE_CATEGORIES, c.category),
            barClass: CATEGORY_BAR[c.category],
            current: c.current,
          }))
      : [...budget.byLeg]
          .sort((a, b) => b.current - a.current)
          .map((l) => ({ key: String(l.legId), label: legName(l.legId), barClass: "bg-category-transit", current: l.current }))
  );

  const groups = new Map<string, { label: string; lines: BudgetLine[] }>();
  for (const line of budget.lines) {
    const key = grouping === "category" ? (line.category as string) : String(line.legId);
    const label = grouping === "category" ? enumLabel(EXPENSE_CATEGORIES, line.category) : legName(line.legId);
    if (!groups.has(key)) groups.set(key, { label, lines: [] });
    groups.get(key)!.lines.push(line);
  }

  return (
    <Screen scroll>
      {/* Headline totals */}
      <Card className="mb-4">
        <Text className="text-xs uppercase tracking-wide text-text-muted">Projected total</Text>
        <Text className="text-3xl font-bold text-text-primary dark:text-text-primary-dark">
          {money(grand.current, home)}
        </Text>
        <View className="mt-3 flex-row justify-between">
          <Total label="Estimated" value={money(grand.estimated, home)} />
          <Total label="Actual" value={money(grand.actual, home)} />
          <VarianceTotal value={grand.variance} currency={home} />
        </View>
        {budget.unresolvedCount > 0 && (
          <View className="mt-3 self-start rounded bg-status-warning/15 px-2 py-1">
            <Text className="text-xs text-status-warning">
              {budget.unresolvedCount} line{budget.unresolvedCount === 1 ? "" : "s"} still estimate-only
            </Text>
          </View>
        )}
      </Card>

      <Button
        className="mb-4"
        title="+ Add expense"
        onPress={() => {
          setEditing(null);
          setFormOpen(true);
        }}
      />

      {budget.lines.length > 0 && (
        <SegmentedControl
          className="mb-3"
          value={grouping}
          onChange={setGrouping}
          segments={[
            { value: "category", label: "By category" },
            { value: "leg", label: "By city" },
          ]}
        />
      )}

      {/* Rollup bars */}
      {rollups.map((r) => (
        <Card key={r.key} className="mb-2">
          <View className="mb-1.5 flex-row items-center justify-between">
            <Text className="font-medium text-text-primary dark:text-text-primary-dark">{r.label}</Text>
            <Text className="font-semibold text-text-primary dark:text-text-primary-dark">{money(r.current, home)}</Text>
          </View>
          <View className="h-2 overflow-hidden rounded bg-page dark:bg-page-dark">
            <View className={`h-full ${r.barClass}`} style={{ width: `${(r.current / maxCurrent) * 100}%` }} />
          </View>
        </Card>
      ))}

      {budget.lines.length === 0 && (
        <Card className="mb-4 items-center py-8">
          <Text className="mb-1 text-base font-medium text-text-primary dark:text-text-primary-dark">
            No expenses yet
          </Text>
          <Text className="text-center text-sm text-text-muted">
            Tap &ldquo;Add expense&rdquo; above, or add a price to a booking on this trip and it shows up here automatically.
          </Text>
        </Card>
      )}

      {/* Line list */}
      {[...groups.values()].map((group) => (
        <View key={group.label} className="mb-4">
          <Text className="mb-2 mt-2 text-xs font-semibold uppercase text-text-muted">{group.label}</Text>
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
                  ? () => removeExpense.mutate({ expenseId: line.expenseId! })
                  : undefined
              }
            />
          ))}
        </View>
      ))}

      <Sheet visible={formOpen} onClose={() => setFormOpen(false)}>
        <ExpenseForm
          key={editing?.id ?? "new"}
          tripId={tripId}
          home={home}
          editing={editing}
          legs={trip.legs.map((l) => ({ id: l.id, city: l.city }))}
          bookings={(bookings ?? [])
            .filter((b) => b.price != null)
            .map((b) => ({ id: b.id, title: b.title, price: b.price as number, currency: b.currency }))}
          onDone={() => setFormOpen(false)}
        />
      </Sheet>
    </Screen>
  );
}

function Total({ label, value }: { label: string; value: string }) {
  return (
    <View>
      <Text className="text-xs text-text-muted">{label}</Text>
      <Text className="font-semibold text-text-primary dark:text-text-primary-dark">{value}</Text>
    </View>
  );
}

function VarianceTotal({ value, currency }: { value: number; currency: string }) {
  const over = value > 0;
  const label = value === 0 ? "—" : `${over ? "+" : "−"}${money(Math.abs(value), currency)}`;
  return (
    <View>
      <Text className="text-xs text-text-muted">Variance</Text>
      <Text className={`font-semibold ${value === 0 ? "text-text-muted" : over ? "text-status-critical" : "text-status-good"}`}>
        {label}
      </Text>
    </View>
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
    <Card className="mb-2 flex-row items-center justify-between">
      <View className="mr-2 flex-1">
        <View className="flex-row items-center gap-2">
          <Text className="flex-shrink text-text-primary dark:text-text-primary-dark" numberOfLines={1}>
            {line.label}
          </Text>
          {line.source === "booking" && (
            <Text className="rounded bg-page px-1 py-0.5 text-[10px] uppercase text-text-muted dark:bg-page-dark">Booking</Text>
          )}
          {line.unresolved && (
            <Text className="rounded bg-status-warning/15 px-1 py-0.5 text-[10px] uppercase text-status-warning">Estimate</Text>
          )}
        </View>
        <Text className="mt-0.5 text-xs text-text-muted">
          {line.estimateHome != null ? `est ${money(line.estimateHome, home)}` : ""}
          {line.estimateHome != null && line.actualHome != null ? " · " : ""}
          {line.actualHome != null ? `actual ${money(line.actualHome, home)}${line.actualFromBooking ? " (via booking)" : ""}` : ""}
        </Text>
      </View>
      <View className="items-end">
        <Text className="font-semibold text-text-primary dark:text-text-primary-dark">
          {money(line.actualHome ?? line.estimateHome ?? 0, home)}
        </Text>
        {(onEdit || onDelete) && (
          <View className="mt-1 flex-row gap-3">
            {onEdit && (
              <Pressable onPress={onEdit}>
                <Text className="text-xs text-category-transit">Edit</Text>
              </Pressable>
            )}
            {onDelete && (
              <Pressable onPress={onDelete}>
                <Text className="text-xs text-status-critical">Delete</Text>
              </Pressable>
            )}
          </View>
        )}
      </View>
    </Card>
  );
}

const CATEGORY_SEGMENTS = EXPENSE_CATEGORIES.map((c) => ({ value: c.key as ExpenseCategory, label: c.label }));

function ExpenseForm({
  tripId,
  home,
  editing,
  legs,
  bookings,
  onDone,
}: {
  tripId: number;
  home: string;
  editing: Expense | null;
  legs: { id: number; city: string }[];
  bookings: { id: number; title: string; price: number; currency: string | null }[];
  onDone: () => void;
}) {
  const createExpense = useCreateExpense(tripId);
  const updateExpense = useUpdateExpense(tripId);

  const [category, setCategory] = useState<ExpenseCategory>(editing?.category ?? "other");
  const [label, setLabel] = useState(editing?.label ?? "");
  const [legId, setLegId] = useState<number | null>(editing?.legId ?? null);
  const [estAmount, setEstAmount] = useState(editing?.estimate ? String(editing.estimate.amount) : "");
  const [estCurrency, setEstCurrency] = useState(editing?.estimate?.currency ?? home);
  const [actualMode, setActualMode] = useState<"none" | "typed" | "booking">(
    editing?.actualBookingId != null ? "booking" : editing?.actual ? "typed" : "none",
  );
  const [actAmount, setActAmount] = useState(editing?.actual ? String(editing.actual.amount) : "");
  const [actCurrency, setActCurrency] = useState(editing?.actual?.currency ?? home);
  const [actualBookingId, setActualBookingId] = useState<number | null>(editing?.actualBookingId ?? null);
  const [notes, setNotes] = useState(editing?.notes ?? "");

  function buildBody(): CreateExpenseBody {
    const body: CreateExpenseBody = {
      category,
      label: label.trim(),
      legId,
      notes: notes.trim() || null,
      estimate: estAmount.trim() ? { amount: Number(estAmount), currency: estCurrency.toUpperCase() } : null,
    };
    if (actualMode === "booking" && actualBookingId != null) {
      body.actualBookingId = actualBookingId;
      body.actual = null;
    } else if (actualMode === "typed" && actAmount.trim()) {
      body.actual = { amount: Number(actAmount), currency: actCurrency.toUpperCase() };
      body.actualBookingId = null;
    } else {
      body.actual = null;
      body.actualBookingId = null;
    }
    return body;
  }

  function save() {
    if (!label.trim()) return;
    const body = buildBody();
    if (editing) updateExpense.update(editing.id, body);
    else createExpense.create(body);
    onDone();
  }

  return (
    <View>
      <Text className="mb-3 text-lg font-semibold text-text-primary dark:text-text-primary-dark">
        {editing ? "Edit expense" : "Add expense"}
      </Text>

      <TextField className="mb-3" label="Label" value={label} onChangeText={setLabel} placeholder="e.g. Hotel Arts, dinner, tickets" />

      <Text className="mb-1 text-sm text-text-secondary dark:text-text-secondary-dark">Category</Text>
      <SegmentedControl className="mb-3" segments={CATEGORY_SEGMENTS} value={category} onChange={setCategory} />

      {legs.length > 0 && (
        <>
          <Text className="mb-1 text-sm text-text-secondary dark:text-text-secondary-dark">City (optional)</Text>
          <SegmentedControl
            className="mb-3"
            segments={[{ value: "none", label: "None" }, ...legs.map((l) => ({ value: String(l.id), label: l.city }))]}
            value={legId == null ? "none" : String(legId)}
            onChange={(v) => setLegId(v === "none" ? null : Number(v))}
          />
        </>
      )}

      <Text className="mb-1 text-sm text-text-secondary dark:text-text-secondary-dark">Estimate</Text>
      <View className="mb-3 flex-row gap-2">
        <TextField className="flex-1" value={estAmount} onChangeText={setEstAmount} keyboardType="decimal-pad" placeholder="Amount" />
        <TextField className="w-24" value={estCurrency} onChangeText={setEstCurrency} autoCapitalize="characters" maxLength={3} placeholder="USD" />
      </View>

      <Text className="mb-1 text-sm text-text-secondary dark:text-text-secondary-dark">Actual</Text>
      <SegmentedControl
        className="mb-2"
        value={actualMode}
        onChange={setActualMode}
        segments={[
          { value: "none", label: "Not yet" },
          { value: "typed", label: "Enter amount" },
          { value: "booking", label: "Link booking" },
        ]}
      />
      {actualMode === "typed" && (
        <View className="mb-3 flex-row gap-2">
          <TextField className="flex-1" value={actAmount} onChangeText={setActAmount} keyboardType="decimal-pad" placeholder="Amount" />
          <TextField className="w-24" value={actCurrency} onChangeText={setActCurrency} autoCapitalize="characters" maxLength={3} placeholder="USD" />
        </View>
      )}
      {actualMode === "booking" && (
        <View className="mb-3">
          {bookings.length === 0 ? (
            <Text className="text-xs text-text-muted">No bookings with a price on this trip yet.</Text>
          ) : (
            <SegmentedControl
              segments={bookings.map((b) => ({ value: String(b.id), label: `${b.title} · ${money(b.price, b.currency ?? home)}` }))}
              value={actualBookingId == null ? "" : String(actualBookingId)}
              onChange={(v) => setActualBookingId(v ? Number(v) : null)}
            />
          )}
        </View>
      )}

      <TextField className="mb-4" label="Notes" value={notes} onChangeText={setNotes} multiline placeholder="Optional" />

      <Button title={editing ? "Save changes" : "Add expense"} onPress={save} disabled={!label.trim()} />
    </View>
  );
}
