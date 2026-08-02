import type { FastifyInstance, FastifyRequest } from "fastify";
import { DATE_ONLY_REGEX, SetDayNoteBody } from "@travel/types";
import { authenticate } from "../middleware/auth";
import { getPool } from "../db";

function userId(request: FastifyRequest): number {
  return (request.user as { sub: number }).sub;
}

async function assertOwnsTrip(tripId: string, uid: number): Promise<boolean> {
  const [rows] = await getPool().query("SELECT id FROM trips WHERE id = ? AND user_id = ?", [tripId, uid]);
  return (rows as unknown[]).length > 0;
}

const NOTE_SELECT = `
  SELECT trip_id AS tripId, note_date AS date, note,
         created_at AS createdAt, updated_at AS updatedAt
  FROM day_notes
`;

/** Day notes are keyed by (trip, date) rather than an id — the client already
 * knows the date it's editing, so writes are a single idempotent upsert and
 * there's nothing to look up first. */
export async function dayNotesRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate] };

  app.get<{ Params: { tripId: string } }>("/:tripId/day-notes", auth, async (request, reply) => {
    if (!(await assertOwnsTrip(request.params.tripId, userId(request))))
      return reply.code(404).send({ error: "not found" });
    const [rows] = await getPool().query(`${NOTE_SELECT} WHERE trip_id = ? ORDER BY note_date`, [
      request.params.tripId,
    ]);
    return rows;
  });

  app.put<{ Params: { tripId: string; date: string } }>(
    "/:tripId/day-notes/:date",
    auth,
    async (request, reply) => {
      if (!(await assertOwnsTrip(request.params.tripId, userId(request))))
        return reply.code(404).send({ error: "not found" });
      if (!DATE_ONLY_REGEX.test(request.params.date))
        return reply.code(400).send({ error: "invalid date" });

      const parsed = SetDayNoteBody.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
      const note = parsed.data.note.trim();

      // Blank clears the day — deleting the row keeps "has a note" a simple
      // row-exists check for every reader instead of an emptiness test.
      if (!note) {
        await getPool().query("DELETE FROM day_notes WHERE trip_id = ? AND note_date = ?", [
          request.params.tripId,
          request.params.date,
        ]);
        return reply.code(204).send();
      }

      await getPool().query(
        `INSERT INTO day_notes (trip_id, note_date, note) VALUES (?, ?, ?)
         ON DUPLICATE KEY UPDATE note = VALUES(note)`,
        [request.params.tripId, request.params.date, note],
      );
      const [rows] = await getPool().query(`${NOTE_SELECT} WHERE trip_id = ? AND note_date = ?`, [
        request.params.tripId,
        request.params.date,
      ]);
      return (rows as unknown[])[0];
    },
  );
}
