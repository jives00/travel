import type { FastifyInstance, FastifyRequest } from "fastify";
import { CreateLegBody, ReorderLegsBody, UpdateLegBody } from "@travel/types";
import { authenticate } from "../middleware/auth";
import { getPool } from "../db";

function userId(request: FastifyRequest): number {
  return (request.user as { sub: number }).sub;
}

const LEG_SELECT = `
  SELECT id, trip_id AS tripId, sort_order AS sortOrder, city,
         start_date AS startDate, end_date AS endDate, day_count AS dayCount,
         lodging_place_id AS lodgingPlaceId, currency,
         created_at AS createdAt, updated_at AS updatedAt
  FROM legs
`;

async function assertOwnsTrip(tripId: string | number, uid: number): Promise<boolean> {
  const [rows] = await getPool().query("SELECT id FROM trips WHERE id = ? AND user_id = ?", [tripId, uid]);
  return (rows as unknown[]).length > 0;
}

export async function legsRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate] };

  app.post<{ Params: { tripId: string } }>("/:tripId/legs", auth, async (request, reply) => {
    const uid = userId(request);
    if (!(await assertOwnsTrip(request.params.tripId, uid))) return reply.code(404).send({ error: "not found" });

    const parsed = CreateLegBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const body = parsed.data;

    const [[{ maxOrder }]] = (await getPool().query(
      "SELECT COALESCE(MAX(sort_order), -1) AS maxOrder FROM legs WHERE trip_id = ?",
      [request.params.tripId],
    )) as [{ maxOrder: number }[], unknown];

    const [result] = await getPool().query(
      `INSERT INTO legs (trip_id, sort_order, city, start_date, end_date, day_count, lodging_place_id, currency)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        request.params.tripId,
        maxOrder + 1,
        body.city,
        body.startDate ?? null,
        body.endDate ?? null,
        body.dayCount ?? null,
        body.lodgingPlaceId ?? null,
        body.currency ?? null,
      ],
    );
    const insertId = (result as { insertId: number }).insertId;
    const [rows] = await getPool().query(`${LEG_SELECT} WHERE id = ?`, [insertId]);
    return reply.code(201).send((rows as unknown[])[0]);
  });

  app.patch<{ Params: { tripId: string; legId: string } }>(
    "/:tripId/legs/:legId",
    auth,
    async (request, reply) => {
      const uid = userId(request);
      if (!(await assertOwnsTrip(request.params.tripId, uid))) return reply.code(404).send({ error: "not found" });

      const parsed = UpdateLegBody.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
      const body = parsed.data;

      const fields: string[] = [];
      const params: unknown[] = [];
      for (const [key, column] of [
        ["city", "city"],
        ["startDate", "start_date"],
        ["endDate", "end_date"],
        ["dayCount", "day_count"],
        ["lodgingPlaceId", "lodging_place_id"],
        ["currency", "currency"],
      ] as const) {
        if (body[key] !== undefined) {
          fields.push(`${column} = ?`);
          params.push(body[key]);
        }
      }
      if (fields.length === 0) return reply.code(400).send({ error: "no fields to update" });
      params.push(request.params.legId, request.params.tripId);
      await getPool().query(`UPDATE legs SET ${fields.join(", ")} WHERE id = ? AND trip_id = ?`, params);

      const [rows] = await getPool().query(`${LEG_SELECT} WHERE id = ?`, [request.params.legId]);
      return (rows as unknown[])[0];
    },
  );

  // Reordering never blocks on booking-date mismatches (spec: warn-and-flag, not
  // block) — the flagging itself lands with bookings in Slice 4.
  app.post<{ Params: { tripId: string } }>("/:tripId/legs/reorder", auth, async (request, reply) => {
    const uid = userId(request);
    if (!(await assertOwnsTrip(request.params.tripId, uid))) return reply.code(404).send({ error: "not found" });

    const parsed = ReorderLegsBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });

    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      for (const [index, legId] of parsed.data.legIdsInOrder.entries()) {
        await conn.query("UPDATE legs SET sort_order = ? WHERE id = ? AND trip_id = ?", [
          index,
          legId,
          request.params.tripId,
        ]);
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    const [rows] = await getPool().query(`${LEG_SELECT} WHERE trip_id = ? ORDER BY sort_order`, [
      request.params.tripId,
    ]);
    return rows;
  });

  app.delete<{ Params: { tripId: string; legId: string } }>(
    "/:tripId/legs/:legId",
    auth,
    async (request, reply) => {
      const uid = userId(request);
      if (!(await assertOwnsTrip(request.params.tripId, uid))) return reply.code(404).send({ error: "not found" });
      await getPool().query("DELETE FROM legs WHERE id = ? AND trip_id = ?", [
        request.params.legId,
        request.params.tripId,
      ]);
      return reply.code(204).send();
    },
  );
}
