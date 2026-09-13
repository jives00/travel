import type { FastifyInstance, FastifyRequest } from "fastify";
import { ReadinessDismissalBody } from "@travel/types";
import { authenticate } from "../middleware/auth";
import { getPool } from "../db";

function userId(request: FastifyRequest): number {
  return (request.user as { sub: number }).sub;
}

async function assertOwnsTrip(tripId: string, uid: number): Promise<boolean> {
  const [rows] = await getPool().query("SELECT id FROM trips WHERE id = ? AND user_id = ?", [tripId, uid]);
  return (rows as unknown[]).length > 0;
}

const DISMISSAL_SELECT = `
  SELECT trip_id AS tripId, nudge_key AS \`key\`, dismissed_at AS dismissedAt
  FROM readiness_dismissals
`;

/**
 * Dismissed trip-readiness nudges. The key's meaning lives in @travel/core
 * (`computeReadiness`); this route treats it as an opaque string, so a new rule
 * needs no migration here.
 *
 * Both writes take a *list* of keys and are idempotent — dismissing the "3
 * cities still need dates" line is one call, and a replayed offline mutation
 * can't fail on a row that's already there (or already gone).
 */
export async function readinessRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate] };

  app.get<{ Params: { tripId: string } }>("/:tripId/readiness/dismissals", auth, async (request, reply) => {
    if (!(await assertOwnsTrip(request.params.tripId, userId(request))))
      return reply.code(404).send({ error: "not found" });
    const [rows] = await getPool().query(`${DISMISSAL_SELECT} WHERE trip_id = ? ORDER BY dismissed_at`, [
      request.params.tripId,
    ]);
    return rows;
  });

  app.post<{ Params: { tripId: string } }>("/:tripId/readiness/dismissals", auth, async (request, reply) => {
    if (!(await assertOwnsTrip(request.params.tripId, userId(request))))
      return reply.code(404).send({ error: "not found" });
    const parsed = ReadinessDismissalBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });

    const keys = [...new Set(parsed.data.keys)];
    await getPool().query(
      `INSERT INTO readiness_dismissals (trip_id, nudge_key) VALUES ${keys.map(() => "(?, ?)").join(", ")}
       ON DUPLICATE KEY UPDATE dismissed_at = dismissed_at`,
      keys.flatMap((k) => [request.params.tripId, k]),
    );
    const [rows] = await getPool().query(`${DISMISSAL_SELECT} WHERE trip_id = ? ORDER BY dismissed_at`, [
      request.params.tripId,
    ]);
    return rows;
  });

  // Restore: DELETE carries a body, since a key like "leg:7:dates" would need
  // escaping in a path segment and restoring several at once is one action.
  app.delete<{ Params: { tripId: string } }>("/:tripId/readiness/dismissals", auth, async (request, reply) => {
    if (!(await assertOwnsTrip(request.params.tripId, userId(request))))
      return reply.code(404).send({ error: "not found" });
    const parsed = ReadinessDismissalBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });

    const keys = [...new Set(parsed.data.keys)];
    await getPool().query(
      `DELETE FROM readiness_dismissals WHERE trip_id = ? AND nudge_key IN (${keys.map(() => "?").join(", ")})`,
      [request.params.tripId, ...keys],
    );
    const [rows] = await getPool().query(`${DISMISSAL_SELECT} WHERE trip_id = ? ORDER BY dismissed_at`, [
      request.params.tripId,
    ]);
    return rows;
  });
}
