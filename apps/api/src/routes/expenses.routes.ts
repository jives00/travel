import type { FastifyInstance, FastifyRequest } from "fastify";
import { CreateExpenseBody, UpdateExpenseBody, type Expense } from "@travel/types";
import { convert, rollupBudget, bookingCategory, type BudgetInputLine } from "@travel/core";
import { authenticate } from "../middleware/auth";
import { getPool } from "../db";
import { getFxRate, FxUnavailableError } from "../services/fx.client";

function userId(request: FastifyRequest): number {
  return (request.user as { sub: number }).sub;
}

async function assertOwnsTrip(tripId: string | number, uid: number): Promise<boolean> {
  const [rows] = await getPool().query("SELECT id FROM trips WHERE id = ? AND user_id = ?", [tripId, uid]);
  return (rows as unknown[]).length > 0;
}

/** settings.homeCurrency → trip.homeCurrency → USD. Snapshotted onto each row at
 * creation, and used as the display/conversion currency for the summary. */
async function resolveHomeCurrency(tripId: string | number, uid: number): Promise<string> {
  const [s] = await getPool().query("SELECT home_currency FROM settings WHERE user_id = ?", [uid]);
  const fromSettings = (s as { home_currency: string | null }[])[0]?.home_currency;
  if (fromSettings) return fromSettings;
  const [t] = await getPool().query("SELECT home_currency FROM trips WHERE id = ?", [tripId]);
  const fromTrip = (t as { home_currency: string | null }[])[0]?.home_currency;
  return fromTrip ?? "USD";
}

interface ExpenseRow {
  id: number;
  tripId: number;
  legId: number | null;
  category: Expense["category"];
  label: string;
  estAmount: number | null;
  estCurrency: string | null;
  estFxRate: number | null;
  estHomeAmount: number | null;
  actAmount: number | null;
  actCurrency: string | null;
  actFxRate: number | null;
  actHomeAmount: number | null;
  actualBookingId: number | null;
  homeCurrency: string;
  placeId: number | null;
  itineraryItemId: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

const EXPENSE_SELECT = `
  SELECT id, trip_id AS tripId, leg_id AS legId, category, label,
         est_amount AS estAmount, est_currency AS estCurrency, est_fx_rate AS estFxRate, est_home_amount AS estHomeAmount,
         act_amount AS actAmount, act_currency AS actCurrency, act_fx_rate AS actFxRate, act_home_amount AS actHomeAmount,
         actual_booking_id AS actualBookingId, home_currency AS homeCurrency,
         place_id AS placeId, itinerary_item_id AS itineraryItemId, notes,
         created_at AS createdAt, updated_at AS updatedAt
  FROM expenses
`;

function mapExpense(r: ExpenseRow): Expense {
  return {
    id: r.id,
    tripId: r.tripId,
    legId: r.legId,
    category: r.category,
    label: r.label,
    estimate:
      r.estAmount != null
        ? { amount: r.estAmount, currency: r.estCurrency!, fxRate: r.estFxRate!, homeAmount: r.estHomeAmount! }
        : null,
    actual:
      r.actAmount != null
        ? { amount: r.actAmount, currency: r.actCurrency!, fxRate: r.actFxRate!, homeAmount: r.actHomeAmount! }
        : null,
    actualBookingId: r.actualBookingId,
    homeCurrency: r.homeCurrency,
    placeId: r.placeId,
    itineraryItemId: r.itineraryItemId,
    notes: r.notes,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

interface MoneyColumns {
  amount: number | null;
  currency: string | null;
  fxRate: number | null;
  homeAmount: number | null;
}

/** Fetches the FX rate and freezes the home-currency amount for one typed side. */
async function freezeMoney(
  input: { amount: number; currency: string } | null | undefined,
  homeCurrency: string,
): Promise<MoneyColumns> {
  if (!input) return { amount: null, currency: null, fxRate: null, homeAmount: null };
  const rate = await getFxRate(input.currency, homeCurrency);
  return {
    amount: input.amount,
    currency: input.currency.toUpperCase(),
    fxRate: rate,
    homeAmount: convert(input.amount, rate),
  };
}

/** Converts a priced booking into a home-currency amount at read time (booking
 * prices carry no frozen rate). Null currency is assumed to already be home. */
async function bookingActualHome(price: number, currency: string | null, homeCurrency: string): Promise<number> {
  const cur = currency ?? homeCurrency;
  try {
    return convert(price, await getFxRate(cur, homeCurrency));
  } catch {
    return price; // FX unavailable — treat as already home currency rather than fail the summary
  }
}

interface BookingRow {
  id: number;
  legId: number | null;
  type: string;
  title: string;
  price: number | null;
  currency: string | null;
}

export async function expensesRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate] };

  app.get<{ Params: { tripId: string } }>("/:tripId/expenses", auth, async (request, reply) => {
    if (!(await assertOwnsTrip(request.params.tripId, userId(request))))
      return reply.code(404).send({ error: "not found" });
    const [rows] = await getPool().query(`${EXPENSE_SELECT} WHERE trip_id = ? ORDER BY created_at`, [
      request.params.tripId,
    ]);
    return (rows as ExpenseRow[]).map(mapExpense);
  });

  app.post<{ Params: { tripId: string } }>("/:tripId/expenses", auth, async (request, reply) => {
    const uid = userId(request);
    if (!(await assertOwnsTrip(request.params.tripId, uid))) return reply.code(404).send({ error: "not found" });

    const parsed = CreateExpenseBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const body = parsed.data;

    const homeCurrency = await resolveHomeCurrency(request.params.tripId, uid);
    // A linked booking supplies the actual — a typed actual is ignored in that case.
    const linkedBooking = body.actualBookingId ?? null;

    let est: MoneyColumns;
    let act: MoneyColumns;
    try {
      est = await freezeMoney(body.estimate, homeCurrency);
      act = linkedBooking != null ? await freezeMoney(null, homeCurrency) : await freezeMoney(body.actual, homeCurrency);
    } catch (err) {
      if (err instanceof FxUnavailableError)
        return reply.code(422).send({ error: `No exchange rate for ${err.currency} — enter the amount in ${homeCurrency}.` });
      throw err;
    }

    const [result] = await getPool().query(
      `INSERT INTO expenses
         (trip_id, leg_id, category, label,
          est_amount, est_currency, est_fx_rate, est_home_amount,
          act_amount, act_currency, act_fx_rate, act_home_amount,
          actual_booking_id, home_currency, place_id, itinerary_item_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        request.params.tripId,
        body.legId ?? null,
        body.category,
        body.label,
        est.amount, est.currency, est.fxRate, est.homeAmount,
        act.amount, act.currency, act.fxRate, act.homeAmount,
        linkedBooking,
        homeCurrency,
        body.placeId ?? null,
        body.itineraryItemId ?? null,
        body.notes ?? null,
      ],
    );
    const insertId = (result as { insertId: number }).insertId;
    const [rows] = await getPool().query(`${EXPENSE_SELECT} WHERE id = ?`, [insertId]);
    return reply.code(201).send(mapExpense((rows as ExpenseRow[])[0]));
  });

  app.patch<{ Params: { tripId: string; expenseId: string } }>(
    "/:tripId/expenses/:expenseId",
    auth,
    async (request, reply) => {
      const uid = userId(request);
      if (!(await assertOwnsTrip(request.params.tripId, uid))) return reply.code(404).send({ error: "not found" });

      const parsed = UpdateExpenseBody.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
      const body = parsed.data;

      // Load the current row (also verifies it belongs to this trip).
      const [existingRows] = await getPool().query(`${EXPENSE_SELECT} WHERE id = ? AND trip_id = ?`, [
        request.params.expenseId,
        request.params.tripId,
      ]);
      const existing = (existingRows as ExpenseRow[])[0];
      if (!existing) return reply.code(404).send({ error: "not found" });

      const homeCurrency = existing.homeCurrency;
      const fields: string[] = [];
      const params: unknown[] = [];
      const set = (col: string, val: unknown) => {
        fields.push(`${col} = ?`);
        params.push(val);
      };

      if (body.category !== undefined) set("category", body.category);
      if (body.label !== undefined) set("label", body.label);
      if (body.legId !== undefined) set("leg_id", body.legId);
      if (body.placeId !== undefined) set("place_id", body.placeId);
      if (body.itineraryItemId !== undefined) set("itinerary_item_id", body.itineraryItemId);
      if (body.notes !== undefined) set("notes", body.notes);

      try {
        if (body.estimate !== undefined) {
          const m = await freezeMoney(body.estimate, homeCurrency);
          set("est_amount", m.amount);
          set("est_currency", m.currency);
          set("est_fx_rate", m.fxRate);
          set("est_home_amount", m.homeAmount);
        }
        // actualBookingId and a typed actual are mutually exclusive. Linking a
        // booking clears any typed actual; setting a typed actual clears the link.
        if (body.actualBookingId !== undefined) {
          set("actual_booking_id", body.actualBookingId);
          if (body.actualBookingId != null) {
            const cleared = await freezeMoney(null, homeCurrency);
            set("act_amount", cleared.amount);
            set("act_currency", cleared.currency);
            set("act_fx_rate", cleared.fxRate);
            set("act_home_amount", cleared.homeAmount);
          }
        }
        if (body.actual !== undefined) {
          const m = await freezeMoney(body.actual, homeCurrency);
          set("act_amount", m.amount);
          set("act_currency", m.currency);
          set("act_fx_rate", m.fxRate);
          set("act_home_amount", m.homeAmount);
          if (m.amount != null && body.actualBookingId === undefined) set("actual_booking_id", null);
        }
      } catch (err) {
        if (err instanceof FxUnavailableError)
          return reply.code(422).send({ error: `No exchange rate for ${err.currency} — enter the amount in ${homeCurrency}.` });
        throw err;
      }

      if (fields.length === 0) return mapExpense(existing);
      params.push(request.params.expenseId, request.params.tripId);
      await getPool().query(`UPDATE expenses SET ${fields.join(", ")} WHERE id = ? AND trip_id = ?`, params);

      const [rows] = await getPool().query(`${EXPENSE_SELECT} WHERE id = ?`, [request.params.expenseId]);
      return mapExpense((rows as ExpenseRow[])[0]);
    },
  );

  app.delete<{ Params: { tripId: string; expenseId: string } }>(
    "/:tripId/expenses/:expenseId",
    auth,
    async (request, reply) => {
      if (!(await assertOwnsTrip(request.params.tripId, userId(request))))
        return reply.code(404).send({ error: "not found" });
      await getPool().query("DELETE FROM expenses WHERE id = ? AND trip_id = ?", [
        request.params.expenseId,
        request.params.tripId,
      ]);
      return reply.code(204).send();
    },
  );

  // The rollup: manual expenses + priced bookings not already linked to a line,
  // all in the trip's home currency, grouped by category and leg.
  app.get<{ Params: { tripId: string } }>("/:tripId/budget", auth, async (request, reply) => {
    const uid = userId(request);
    if (!(await assertOwnsTrip(request.params.tripId, uid))) return reply.code(404).send({ error: "not found" });

    const homeCurrency = await resolveHomeCurrency(request.params.tripId, uid);

    const [expenseRows] = await getPool().query(`${EXPENSE_SELECT} WHERE trip_id = ? ORDER BY created_at`, [
      request.params.tripId,
    ]);
    const [bookingRows] = await getPool().query(
      `SELECT id, leg_id AS legId, type, title, price, currency
         FROM bookings WHERE trip_id = ? AND price IS NOT NULL`,
      [request.params.tripId],
    );

    const bookingsById = new Map<number, BookingRow>();
    for (const b of bookingRows as BookingRow[]) bookingsById.set(b.id, b);

    const linkedBookingIds = new Set<number>();
    for (const r of expenseRows as ExpenseRow[]) if (r.actualBookingId != null) linkedBookingIds.add(r.actualBookingId);

    const lines: import("@travel/types").BudgetLine[] = [];
    const inputs: BudgetInputLine[] = [];

    for (const r of expenseRows as ExpenseRow[]) {
      const estimateHome = r.estHomeAmount;
      let actualHome: number | null = r.actHomeAmount;
      let actualAmount: number | null = r.actAmount;
      let actualCurrency: string | null = r.actCurrency;
      let actualFromBooking = false;

      // Linked booking supplies the actual, converted live.
      if (r.actualBookingId != null) {
        const b = bookingsById.get(r.actualBookingId);
        if (b && b.price != null) {
          actualAmount = b.price;
          actualCurrency = b.currency ?? homeCurrency;
          actualHome = await bookingActualHome(b.price, b.currency, homeCurrency);
          actualFromBooking = true;
        }
      }

      lines.push({
        key: `expense:${r.id}`,
        source: "manual",
        expenseId: r.id,
        bookingId: r.actualBookingId,
        category: r.category,
        legId: r.legId,
        label: r.label,
        estimateAmount: r.estAmount,
        estimateCurrency: r.estCurrency,
        estimateHome,
        actualAmount,
        actualCurrency,
        actualHome,
        actualFromBooking,
        unresolved: estimateHome != null && actualHome == null,
      });
      inputs.push({ category: r.category, legId: r.legId, estimatedHome: estimateHome, actualHome });
    }

    // Priced bookings not linked to any expense → their own actual-only lines.
    for (const b of bookingRows as BookingRow[]) {
      if (b.price == null || linkedBookingIds.has(b.id)) continue;
      const category = bookingCategory(b.type);
      const actualHome = await bookingActualHome(b.price, b.currency, homeCurrency);
      lines.push({
        key: `booking:${b.id}`,
        source: "booking",
        expenseId: null,
        bookingId: b.id,
        category: category as import("@travel/types").ExpenseCategory,
        legId: b.legId,
        label: b.title,
        estimateAmount: null,
        estimateCurrency: null,
        estimateHome: null,
        actualAmount: b.price,
        actualCurrency: b.currency ?? homeCurrency,
        actualHome,
        actualFromBooking: true,
        unresolved: false,
      });
      inputs.push({ category, legId: b.legId, estimatedHome: null, actualHome });
    }

    const rollup = rollupBudget(inputs);
    return {
      homeCurrency,
      grand: rollup.grand,
      byCategory: rollup.byCategory as import("@travel/types").BudgetCategoryRollup[],
      byLeg: rollup.byLeg,
      unresolvedCount: rollup.unresolvedCount,
      lines,
    } satisfies import("@travel/types").BudgetSummary;
  });
}
