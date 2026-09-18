import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ResultSetHeader } from "mysql2";
import { CreateTripLinkBody, UpdateTripLinkBody } from "@travel/types";
import { authenticate } from "../middleware/auth";
import { getPool } from "../db";
import {
  deleteLinkImage,
  isSupportedImageMime,
  linkImageUrl,
  MAX_UPLOAD_BYTES,
  storeLinkImage,
} from "../services/linkImageStore";

function userId(request: FastifyRequest): number {
  return (request.user as { sub: number }).sub;
}

async function assertOwnsTrip(tripId: string, uid: number): Promise<boolean> {
  const [rows] = await getPool().query("SELECT id FROM trips WHERE id = ? AND user_id = ?", [tripId, uid]);
  return (rows as unknown[]).length > 0;
}

// `leg_id` / `itinerary_item_id` (036) and `thumbnail_source` /
// `thumbnail_fetched_at` (036, 038) still exist but are no longer read or
// written — per-city scoping and the og:image scrape were both removed. Inert
// columns rather than a destructive DROP, the same call as the points columns.
const LINK_SELECT = `
  SELECT id, trip_id AS tripId, kind, label, url,
         thumbnail_url AS thumbnailUrl, thumbnail_file AS thumbnailFile,
         sort_order AS sortOrder, created_at AS createdAt, updated_at AS updatedAt
  FROM trip_links
`;

async function findLink(linkId: string, tripId: string): Promise<unknown | null> {
  const [rows] = await getPool().query(`${LINK_SELECT} WHERE id = ? AND trip_id = ?`, [linkId, tripId]);
  return (rows as unknown[])[0] ?? null;
}

/** Links out to things that live elsewhere — photo albums today. A section of
 * the trip page in their own right, not part of the recap (see plans/todo.md
 * #9b).
 *
 * Thumbnails are uploaded, never fetched: see the note on `TripLink` in
 * `@travel/types` for why the scrape was removed outright rather than kept as a
 * best-effort extra. */
export async function tripLinksRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate] };

  app.get<{ Params: { tripId: string } }>("/:tripId/links", auth, async (request, reply) => {
    if (!(await assertOwnsTrip(request.params.tripId, userId(request))))
      return reply.code(404).send({ error: "not found" });
    const [rows] = await getPool().query(`${LINK_SELECT} WHERE trip_id = ? ORDER BY sort_order, id`, [
      request.params.tripId,
    ]);
    return rows;
  });

  app.post<{ Params: { tripId: string } }>("/:tripId/links", auth, async (request, reply) => {
    if (!(await assertOwnsTrip(request.params.tripId, userId(request))))
      return reply.code(404).send({ error: "not found" });

    const parsed = CreateTripLinkBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const body = parsed.data;

    // The subquery is wrapped in a derived table because MySQL refuses to read
    // the table an INSERT is writing to directly.
    const [result] = await getPool().query(
      `INSERT INTO trip_links (trip_id, kind, label, url, sort_order)
       VALUES (?, ?, ?, ?,
               (SELECT COALESCE(MAX(t.sort_order) + 1, 0)
                  FROM (SELECT sort_order FROM trip_links WHERE trip_id = ?) t))`,
      [request.params.tripId, body.kind ?? "photo_album", body.label.trim(), body.url, request.params.tripId],
    );
    const id = (result as ResultSetHeader).insertId;
    return reply.code(201).send(await findLink(String(id), request.params.tripId));
  });

  app.patch<{ Params: { tripId: string; linkId: string } }>(
    "/:tripId/links/:linkId",
    auth,
    async (request, reply) => {
      if (!(await assertOwnsTrip(request.params.tripId, userId(request))))
        return reply.code(404).send({ error: "not found" });

      const parsed = UpdateTripLinkBody.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
      const body = parsed.data;

      const fields: string[] = [];
      const params: unknown[] = [];
      for (const [key, column] of [
        ["label", "label"],
        ["url", "url"],
        ["sortOrder", "sort_order"],
      ] as const) {
        if (body[key] !== undefined) {
          fields.push(`${column} = ?`);
          params.push(body[key]);
        }
      }
      if (fields.length === 0) return reply.code(400).send({ error: "no fields to update" });

      // Nothing here can touch the thumbnail, and that is the point. An update
      // used to carry it, and an edit form that could not pre-fill an uploaded
      // thumbnail therefore sent null on every save — renaming an album
      // silently deleted its picture, file and all.
      params.push(request.params.linkId, request.params.tripId);
      await getPool().query(`UPDATE trip_links SET ${fields.join(", ")} WHERE id = ? AND trip_id = ?`, params);

      const row = await findLink(request.params.linkId, request.params.tripId);
      if (!row) return reply.code(404).send({ error: "not found" });
      return row;
    },
  );

  /** Upload or replace the thumbnail. The only way a link ever gets one. */
  app.post<{ Params: { tripId: string; linkId: string } }>(
    "/:tripId/links/:linkId/image",
    auth,
    async (request, reply) => {
      if (!(await assertOwnsTrip(request.params.tripId, userId(request))))
        return reply.code(404).send({ error: "not found" });

      const existing = (await findLink(request.params.linkId, request.params.tripId)) as
        | { thumbnailFile: string | null }
        | null;
      if (!existing) return reply.code(404).send({ error: "not found" });

      const file = await request.file({ limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });
      if (!file) return reply.code(400).send({ error: "no file uploaded" });
      if (!isSupportedImageMime(file.mimetype))
        return reply.code(400).send({ error: `unsupported image type: ${file.mimetype}` });

      const bytes = await file.toBuffer();
      // `toBuffer` resolves even when the stream was cut off at the limit, so
      // the truncation flag is the only thing that distinguishes a complete
      // upload from a silently half-written image.
      if (file.file.truncated) return reply.code(413).send({ error: "image is larger than 10MB" });

      const filename = await storeLinkImage(bytes, file.mimetype);
      await getPool().query(
        "UPDATE trip_links SET thumbnail_file = ?, thumbnail_url = ? WHERE id = ? AND trip_id = ?",
        [filename, linkImageUrl(filename), request.params.linkId, request.params.tripId],
      );
      // Only after the row points at the new file, so a failed write never
      // leaves the link showing a thumbnail that no longer exists.
      await deleteLinkImage(existing.thumbnailFile);

      return await findLink(request.params.linkId, request.params.tripId);
    },
  );

  app.delete<{ Params: { tripId: string; linkId: string } }>(
    "/:tripId/links/:linkId",
    auth,
    async (request, reply) => {
      if (!(await assertOwnsTrip(request.params.tripId, userId(request))))
        return reply.code(404).send({ error: "not found" });

      const existing = (await findLink(request.params.linkId, request.params.tripId)) as
        | { thumbnailFile: string | null }
        | null;
      await getPool().query("DELETE FROM trip_links WHERE id = ? AND trip_id = ?", [
        request.params.linkId,
        request.params.tripId,
      ]);
      // The row is gone, so nothing will ever reference this file again.
      await deleteLinkImage(existing?.thumbnailFile ?? null);
      return reply.code(204).send();
    },
  );
}
