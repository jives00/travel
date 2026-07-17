import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  AddListItemBody,
  CreateListBody,
  ReorderListItemsBody,
  UpdateListBody,
  UpdateListItemBody,
} from "@travel/types";
import { authenticate } from "../middleware/auth";
import { getPool } from "../db";

function userId(request: FastifyRequest): number {
  return (request.user as { sub: number }).sub;
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const LIST_SELECT = `
  SELECT id, user_id AS userId, trip_id AS tripId, name, slug, sort_order AS sortOrder,
         created_at AS createdAt, updated_at AS updatedAt
  FROM custom_lists
`;

const ITEM_SELECT = `
  SELECT id, list_id AS listId, text, done, sort_order AS sortOrder, created_at AS createdAt
  FROM list_items
`;

async function withItems(list: { id: number }) {
  const [rows] = await getPool().query(`${ITEM_SELECT} WHERE list_id = ? ORDER BY sort_order, id`, [list.id]);
  return { ...list, items: (rows as { done: number }[]).map((r) => ({ ...r, done: !!r.done })) };
}

export async function listsRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate] };

  app.get<{ Querystring: { tripId?: string } }>("/", auth, async (request) => {
    const clauses = ["user_id = ?"];
    const params: (string | number)[] = [userId(request)];
    if (request.query.tripId) {
      clauses.push("(trip_id = ? OR trip_id IS NULL)");
      params.push(request.query.tripId);
    }
    const [rows] = await getPool().query(
      `${LIST_SELECT} WHERE ${clauses.join(" AND ")} ORDER BY sort_order, name`,
      params,
    );
    return Promise.all((rows as { id: number }[]).map(withItems));
  });

  app.post("/", auth, async (request, reply) => {
    const parsed = CreateListBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const body = parsed.data;

    const [result] = await getPool().query(
      "INSERT INTO custom_lists (user_id, trip_id, name, slug) VALUES (?, ?, ?, ?)",
      [userId(request), body.tripId ?? null, body.name, slugify(body.name)],
    );
    const insertId = (result as { insertId: number }).insertId;
    const [rows] = await getPool().query(`${LIST_SELECT} WHERE id = ?`, [insertId]);
    return reply.code(201).send(await withItems((rows as { id: number }[])[0]));
  });

  app.patch<{ Params: { id: string } }>("/:id", auth, async (request, reply) => {
    const parsed = UpdateListBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    await getPool().query("UPDATE custom_lists SET name = ?, slug = ? WHERE id = ? AND user_id = ?", [
      parsed.data.name,
      slugify(parsed.data.name),
      request.params.id,
      userId(request),
    ]);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>("/:id/copy", auth, async (request, reply) => {
    const [listRows] = await getPool().query(`${LIST_SELECT} WHERE id = ? AND user_id = ?`, [
      request.params.id,
      userId(request),
    ]);
    const source = (listRows as { id: number; tripId: number | null; name: string }[])[0];
    if (!source) return reply.code(404).send({ error: "not found" });

    const copyName = `${source.name} (copy)`;
    const [result] = await getPool().query(
      "INSERT INTO custom_lists (user_id, trip_id, name, slug) VALUES (?, ?, ?, ?)",
      [userId(request), source.tripId, copyName, slugify(copyName)],
    );
    const insertId = (result as { insertId: number }).insertId;

    await getPool().query(
      `INSERT INTO list_items (list_id, text, done, sort_order)
       SELECT ?, text, 0, sort_order FROM list_items WHERE list_id = ?`,
      [insertId, source.id],
    );

    const [rows] = await getPool().query(`${LIST_SELECT} WHERE id = ?`, [insertId]);
    return reply.code(201).send(await withItems((rows as { id: number }[])[0]));
  });

  app.post<{ Params: { id: string } }>("/:id/reset", auth, async (request, reply) => {
    await getPool().query(
      `UPDATE list_items li
       JOIN custom_lists cl ON cl.id = li.list_id
       SET li.done = 0
       WHERE li.list_id = ? AND cl.user_id = ?`,
      [request.params.id, userId(request)],
    );
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>("/:id/items", auth, async (request, reply) => {
    const parsed = AddListItemBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    await getPool().query("INSERT INTO list_items (list_id, text) VALUES (?, ?)", [
      request.params.id,
      parsed.data.text,
    ]);
    return reply.code(204).send();
  });

  app.patch<{ Params: { id: string; itemId: string } }>(
    "/:id/items/:itemId",
    auth,
    async (request, reply) => {
      const parsed = UpdateListItemBody.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
      await getPool().query("UPDATE list_items SET done = ? WHERE id = ? AND list_id = ?", [
        parsed.data.done,
        request.params.itemId,
        request.params.id,
      ]);
      return reply.code(204).send();
    },
  );

  app.post<{ Params: { id: string } }>("/:id/items/reorder", auth, async (request, reply) => {
    const parsed = ReorderListItemsBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    await Promise.all(
      parsed.data.itemIds.map((itemId, index) =>
        getPool().query("UPDATE list_items SET sort_order = ? WHERE id = ? AND list_id = ?", [
          index,
          itemId,
          request.params.id,
        ]),
      ),
    );
    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string; itemId: string } }>(
    "/:id/items/:itemId",
    auth,
    async (request, reply) => {
      await getPool().query("DELETE FROM list_items WHERE id = ? AND list_id = ?", [
        request.params.itemId,
        request.params.id,
      ]);
      return reply.code(204).send();
    },
  );
}
