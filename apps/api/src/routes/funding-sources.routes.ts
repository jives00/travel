import type { FastifyInstance, FastifyRequest } from "fastify";
import { CreateFundingSourceBody, UpdateFundingSourceBody } from "@travel/types";
import { authenticate } from "../middleware/auth";
import { getPool } from "../db";

function userId(request: FastifyRequest): number {
  return (request.user as { sub: number }).sub;
}

const SELECT = `
  SELECT id, name, sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt
  FROM funding_sources
`;

// Insertion order is the fallback, so the seeded three keep the order migration
// 035 gave them and a newly added source lands at the end.
const ORDER = "ORDER BY sort_order, id";

/** User-defined funding sources ("Regular cash", "CC points", a specific card),
 * managed from settings and attached to budget lines. Scoped to the user, not a
 * trip — the same card pays for every trip. */
export async function fundingSourcesRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate] };

  app.get("/", auth, async (request) => {
    const [rows] = await getPool().query(`${SELECT} WHERE user_id = ? ${ORDER}`, [userId(request)]);
    return rows;
  });

  app.post("/", auth, async (request, reply) => {
    const parsed = CreateFundingSourceBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const uid = userId(request);
    const name = parsed.data.name.trim();

    // Sort after everything the user already has, unless they said otherwise.
    let sortOrder = parsed.data.sortOrder;
    if (sortOrder === undefined) {
      const [maxRows] = await getPool().query(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM funding_sources WHERE user_id = ?",
        [uid],
      );
      sortOrder = (maxRows as { next: number }[])[0].next;
    }

    try {
      const [result] = await getPool().query(
        "INSERT INTO funding_sources (user_id, name, sort_order) VALUES (?, ?, ?)",
        [uid, name, sortOrder],
      );
      const [rows] = await getPool().query(`${SELECT} WHERE id = ?`, [(result as { insertId: number }).insertId]);
      return reply.code(201).send((rows as unknown[])[0]);
    } catch (err) {
      // uniq_funding_user_name — two sources with the same name would be
      // indistinguishable in every picker.
      if ((err as { code?: string }).code === "ER_DUP_ENTRY")
        return reply.code(409).send({ error: `You already have a funding source called "${name}".` });
      throw err;
    }
  });

  app.patch<{ Params: { id: string } }>("/:id", auth, async (request, reply) => {
    const parsed = UpdateFundingSourceBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const body = parsed.data;

    const fields: string[] = [];
    const params: unknown[] = [];
    if (body.name !== undefined) {
      fields.push("name = ?");
      params.push(body.name.trim());
    }
    if (body.sortOrder !== undefined) {
      fields.push("sort_order = ?");
      params.push(body.sortOrder);
    }
    if (fields.length === 0) return reply.code(400).send({ error: "no fields to update" });

    params.push(request.params.id, userId(request));
    try {
      await getPool().query(`UPDATE funding_sources SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`, params);
    } catch (err) {
      if ((err as { code?: string }).code === "ER_DUP_ENTRY")
        return reply.code(409).send({ error: `You already have a funding source called "${body.name?.trim()}".` });
      throw err;
    }

    const [rows] = await getPool().query(`${SELECT} WHERE id = ? AND user_id = ?`, [
      request.params.id,
      userId(request),
    ]);
    const row = (rows as unknown[])[0];
    if (!row) return reply.code(404).send({ error: "not found" });
    return row;
  });

  // The FKs are ON DELETE SET NULL (migration 035): deleting a source unassigns
  // its lines, it never deletes spend. The affected lines fall back into the
  // "Unassigned" bucket in the by-source rollup.
  app.delete<{ Params: { id: string } }>("/:id", auth, async (request, reply) => {
    await getPool().query("DELETE FROM funding_sources WHERE id = ? AND user_id = ?", [
      request.params.id,
      userId(request),
    ]);
    return reply.code(204).send();
  });
}

/** True when the id is one of this user's sources. Callers that accept a
 * funding_source_id check this first: the column's FK only proves the row
 * exists, and a bad id would surface as a 500 from MySQL rather than a 400. */
export async function ownsFundingSource(id: number, uid: number): Promise<boolean> {
  const [rows] = await getPool().query("SELECT id FROM funding_sources WHERE id = ? AND user_id = ?", [id, uid]);
  return (rows as unknown[]).length > 0;
}

/** The starting set, created with a brand-new user. Migration 035 seeds the same
 * three for anyone who already exists — the admin row is created *after*
 * migrations run, so it can't be covered there. */
export async function seedFundingSources(uid: number): Promise<void> {
  await getPool().query(
    `INSERT IGNORE INTO funding_sources (user_id, name, sort_order)
     VALUES (?, 'Regular cash', 0), (?, 'Off balance', 1), (?, 'CC points', 2)`,
    [uid, uid, uid],
  );
}
