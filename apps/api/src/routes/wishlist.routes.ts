import type { FastifyInstance, FastifyRequest } from "fastify";
import { CreateWishlistLocationBody } from "@travel/types";
import { authenticate } from "../middleware/auth";
import { getPool } from "../db";

function userId(request: FastifyRequest): number {
  return (request.user as { sub: number }).sub;
}

const SELECT = `
  SELECT id, user_id AS userId, name, type, status, lat, lng, note, created_at AS createdAt
  FROM wishlist_locations
`;

export async function wishlistRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate] };

  app.get("/", auth, async (request) => {
    const [rows] = await getPool().query(`${SELECT} WHERE user_id = ? ORDER BY created_at DESC`, [
      userId(request),
    ]);
    return rows;
  });

  app.post("/", auth, async (request, reply) => {
    const parsed = CreateWishlistLocationBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const body = parsed.data;

    const [result] = await getPool().query(
      "INSERT INTO wishlist_locations (user_id, name, type, status, lat, lng, note) VALUES (?, ?, ?, ?, ?, ?, ?)",
      [userId(request), body.name, body.type, body.status, body.lat, body.lng, body.note ?? null],
    );
    const insertId = (result as { insertId: number }).insertId;
    const [rows] = await getPool().query(`${SELECT} WHERE id = ?`, [insertId]);
    return reply.code(201).send((rows as unknown[])[0]);
  });

  app.delete<{ Params: { id: string } }>("/:id", auth, async (request, reply) => {
    await getPool().query("DELETE FROM wishlist_locations WHERE id = ? AND user_id = ?", [
      request.params.id,
      userId(request),
    ]);
    return reply.code(204).send();
  });
}
