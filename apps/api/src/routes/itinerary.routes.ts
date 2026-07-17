import type { FastifyInstance, FastifyRequest } from "fastify";
import { MoveItemBody, ScheduleItemBody } from "@travel/types";
import { authenticate } from "../middleware/auth";
import { getPool } from "../db";

function userId(request: FastifyRequest): number {
  return (request.user as { sub: number }).sub;
}

const ITEM_SELECT = `
  SELECT id, trip_id AS tripId, leg_id AS legId, day_index AS dayIndex,
         scheduled_date AS scheduledDate, time, sort_order AS sortOrder,
         item_type AS itemType, place_id AS placeId, booking_id AS bookingId,
         activity_text AS activityText, is_private AS isPrivate,
         created_at AS createdAt, updated_at AS updatedAt
  FROM itinerary_items
`;

// mysql2 returns TINYINT(1) as a JS number, not a boolean — coerce before
// this hits the z.boolean() schema in @travel/types.
function withBooleanFlag<T extends { isPrivate: unknown }>(row: T): T {
  return { ...row, isPrivate: Boolean(row.isPrivate) };
}

async function assertOwnsTrip(tripId: string, uid: number): Promise<boolean> {
  const [rows] = await getPool().query("SELECT id FROM trips WHERE id = ? AND user_id = ?", [tripId, uid]);
  return (rows as unknown[]).length > 0;
}

export async function itineraryRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate] };

  app.get<{ Params: { tripId: string } }>("/:tripId/itinerary", auth, async (request, reply) => {
    if (!(await assertOwnsTrip(request.params.tripId, userId(request))))
      return reply.code(404).send({ error: "not found" });
    const [rows] = await getPool().query(
      `${ITEM_SELECT} WHERE trip_id = ? ORDER BY scheduled_date IS NULL, scheduled_date, time IS NULL, time, sort_order`,
      [request.params.tripId],
    );
    return (rows as { isPrivate: unknown }[]).map(withBooleanFlag);
  });

  app.post<{ Params: { tripId: string } }>("/:tripId/itinerary", auth, async (request, reply) => {
    if (!(await assertOwnsTrip(request.params.tripId, userId(request))))
      return reply.code(404).send({ error: "not found" });

    const parsed = ScheduleItemBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const body = parsed.data;

    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();

      const [result] = await conn.query(
        `INSERT INTO itinerary_items (trip_id, leg_id, scheduled_date, time, item_type, place_id, booking_id, activity_text, is_private)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          request.params.tripId,
          body.legId ?? null,
          body.scheduledDate ?? null,
          body.time ?? null,
          body.itemType,
          body.placeId ?? null,
          body.bookingId ?? null,
          body.activityText ?? null,
          body.isPrivate ?? false,
        ],
      );

      // Scheduling a place onto a day is what flips its status to `planned` (spec).
      if (body.itemType === "place" && body.placeId) {
        await conn.query("UPDATE places SET status = 'planned' WHERE id = ?", [body.placeId]);
      }

      await conn.commit();
      const insertId = (result as { insertId: number }).insertId;
      const [rows] = await getPool().query(`${ITEM_SELECT} WHERE id = ?`, [insertId]);
      return reply.code(201).send(withBooleanFlag((rows as { isPrivate: unknown }[])[0]));
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
  });

  app.patch<{ Params: { tripId: string; itemId: string } }>(
    "/:tripId/itinerary/:itemId",
    auth,
    async (request, reply) => {
      if (!(await assertOwnsTrip(request.params.tripId, userId(request))))
        return reply.code(404).send({ error: "not found" });

      const parsed = MoveItemBody.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
      const body = parsed.data;

      const fields: string[] = [];
      const params: unknown[] = [];
      for (const [key, column] of [
        ["legId", "leg_id"],
        ["scheduledDate", "scheduled_date"],
        ["activityText", "activity_text"],
        ["sortOrder", "sort_order"],
        ["isPrivate", "is_private"],
      ] as const) {
        if (body[key] !== undefined) {
          fields.push(`${column} = ?`);
          params.push(body[key]);
        }
      }
      if (body.time !== undefined) {
        fields.push("time = ?");
        params.push(body.time);
      }
      if (fields.length === 0) return reply.code(400).send({ error: "no fields to update" });

      params.push(request.params.itemId, request.params.tripId);
      await getPool().query(
        `UPDATE itinerary_items SET ${fields.join(", ")} WHERE id = ? AND trip_id = ?`,
        params,
      );
      const [rows] = await getPool().query(`${ITEM_SELECT} WHERE id = ?`, [request.params.itemId]);
      return withBooleanFlag((rows as { isPrivate: unknown }[])[0]);
    },
  );

  // Unscheduling does NOT revert place status back to idea — no background status
  // mutation (spec decision, confirmed for the trip-completion case and applied
  // consistently here too).
  app.delete<{ Params: { tripId: string; itemId: string } }>(
    "/:tripId/itinerary/:itemId",
    auth,
    async (request, reply) => {
      if (!(await assertOwnsTrip(request.params.tripId, userId(request))))
        return reply.code(404).send({ error: "not found" });
      await getPool().query("DELETE FROM itinerary_items WHERE id = ? AND trip_id = ?", [
        request.params.itemId,
        request.params.tripId,
      ]);
      return reply.code(204).send();
    },
  );
}
