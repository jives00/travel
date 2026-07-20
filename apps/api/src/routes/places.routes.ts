import type { FastifyInstance, FastifyRequest } from "fastify";
import { CreatePlaceBody, PlaceListQuery, UpdatePlaceBody } from "@travel/types";
import { authenticate } from "../middleware/auth";
import { getPool } from "../db";
import { autocomplete, placeDetails } from "../services/google-places.client";

function userId(request: FastifyRequest): number {
  return (request.user as { sub: number }).sub;
}

interface PlaceRow {
  id: number;
  userId: number;
  googlePlaceId: string | null;
  name: string;
  primaryTag: string;
  status: string;
  address: string | null;
  lat: number;
  lng: number;
  hours: Record<string, string> | null;
  heroPhotoUrl: string | null;
  description: string | null;
  rating: number | null;
  userRatingsTotal: number | null;
  website: string | null;
  googleTypes: string[] | null;
  note: string | null;
  createdAt: string;
  updatedAt: string;
}

// `hours` is a MySQL JSON column — mysql2 already parses JSON-typed columns
// into JS values on read, so no JSON.parse() here (calling it on an
// already-parsed object stringifies it to "[object Object]" first and then
// fails to reparse that).
function serialize(row: PlaceRow) {
  return row;
}

// `p.` prefix used consistently so the optional trip_places JOIN in list() never collides
const SELECT = `
  SELECT p.id, p.user_id AS userId, p.google_place_id AS googlePlaceId, p.name, p.primary_tag AS primaryTag, p.status,
         p.address, p.lat, p.lng, p.hours, p.hero_photo_url AS heroPhotoUrl,
         p.description, p.rating, p.user_ratings_total AS userRatingsTotal, p.website,
         p.google_types AS googleTypes, p.note,
         p.created_at AS createdAt, p.updated_at AS updatedAt
  FROM places p
`;

export async function placesRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate] };

  // Proxied through the API (not called directly from the browser) so session
  // tokens and the API key never reach the client — cost control per the spec.
  app.get<{ Querystring: { input: string; sessionToken: string } }>(
    "/autocomplete",
    auth,
    async (request, reply) => {
      const { input, sessionToken } = request.query;
      if (!input || !sessionToken) return reply.code(400).send({ error: "input and sessionToken required" });
      return autocomplete(input, sessionToken);
    },
  );

  app.get<{ Params: { placeId: string }; Querystring: { sessionToken: string } }>(
    "/autocomplete/:placeId",
    auth,
    async (request, reply) => {
      if (!request.query.sessionToken) return reply.code(400).send({ error: "sessionToken required" });
      return placeDetails(request.params.placeId, request.query.sessionToken);
    },
  );

  app.get("/", auth, async (request, reply) => {
    const parsed = PlaceListQuery.safeParse(request.query);
    if (!parsed.success) return reply.code(400).send({ error: "invalid query" });
    const { status, q, tripId } = parsed.data;

    // `?` placeholders bind positionally by where they appear in the final SQL
    // string, not by JS push order — the JOIN clause is concatenated before
    // WHERE, so its param must come first in the array too, or trip_id/user_id
    // silently swap (only "worked" before when a trip's id happened to equal
    // the user's id).
    let join = "";
    const joinParams: (string | number)[] = [];
    if (tripId) {
      join = "JOIN trip_places tp ON tp.place_id = p.id AND tp.trip_id = ?";
      joinParams.push(tripId);
    }

    const clauses = ["p.user_id = ?"];
    const whereParams: (string | number)[] = [userId(request)];
    if (status) {
      clauses.push("p.status = ?");
      whereParams.push(status);
    }
    if (q) {
      clauses.push("p.name LIKE ?");
      whereParams.push(`%${q}%`);
    }
    const [rows] = await getPool().query(
      `${SELECT} ${join} WHERE ${clauses.join(" AND ")} ORDER BY p.name`,
      [...joinParams, ...whereParams],
    );
    return (rows as PlaceRow[]).map(serialize);
  });

  app.get<{ Params: { id: string } }>("/:id", auth, async (request, reply) => {
    const [rows] = await getPool().query(`${SELECT} WHERE p.id = ? AND p.user_id = ?`, [
      request.params.id,
      userId(request),
    ]);
    const list = rows as PlaceRow[];
    if (list.length === 0) return reply.code(404).send({ error: "not found" });
    return serialize(list[0]);
  });

  app.post("/", auth, async (request, reply) => {
    const parsed = CreatePlaceBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const body = parsed.data;
    const uid = userId(request);

    // A single upsert replaces the old "SELECT to check for a duplicate, then
    // INSERT" two-query dance — for the common case (adding a place via
    // autocomplete, which always has a googlePlaceId) that dup-check ran on
    // every single add even though it almost never finds one. Cutting a round
    // trip matters more than it sounds when local dev reaches the DB over an
    // SSH tunnel to the NAS, not localhost.
    // `id = LAST_INSERT_ID(id)` is the standard MySQL idiom for making
    // insertId reflect the EXISTING row's id when uq_place_google collides,
    // rather than leaving it at 0.
    // `updated_at = NOW()` is deliberately included, not just id=id — mysql2
    // enables CLIENT_FOUND_ROWS by default, under which affectedRows is 1 for
    // BOTH a fresh insert and a duplicate hit that doesn't actually change any
    // column's stored value, making them indistinguishable. Forcing a real
    // value change on every duplicate hit is what makes MySQL report 2 there
    // (verified empirically), which is how `wasDuplicate` below is determined.
    const [result] = await getPool().query(
      `INSERT INTO places (user_id, google_place_id, name, primary_tag, address, lat, lng, location, hours, hero_photo_url, description, rating, user_ratings_total, website, google_types, note)
       VALUES (?, ?, ?, ?, ?, ?, ?, ST_SRID(POINT(?, ?), 0), ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE id = LAST_INSERT_ID(id), updated_at = NOW()`,
      [
        uid,
        body.googlePlaceId ?? null,
        body.name,
        body.primaryTag,
        body.address ?? null,
        body.lat,
        body.lng,
        body.lng,
        body.lat,
        body.hours ? JSON.stringify(body.hours) : null,
        body.heroPhotoUrl ?? null,
        body.description ?? null,
        body.rating ?? null,
        body.userRatingsTotal ?? null,
        body.website ?? null,
        body.googleTypes ? JSON.stringify(body.googleTypes) : null,
        body.note ?? null,
      ],
    );
    const { insertId, affectedRows } = result as { insertId: number; affectedRows: number };
    const wasDuplicate = affectedRows === 2;

    if (body.tripId) {
      await getPool().query("INSERT IGNORE INTO trip_places (trip_id, place_id) VALUES (?, ?)", [
        body.tripId,
        insertId,
      ]);
    }

    const [rows] = await getPool().query(`${SELECT} WHERE p.id = ?`, [insertId]);
    const place = serialize((rows as PlaceRow[])[0]);
    if (wasDuplicate) return reply.code(200).send({ duplicate: true, existing: place });
    return reply.code(201).send(place);
  });

  app.patch<{ Params: { id: string } }>("/:id", auth, async (request, reply) => {
    const parsed = UpdatePlaceBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const body = parsed.data;
    const uid = userId(request);

    const fields: string[] = [];
    const params: unknown[] = [];
    for (const [key, column] of [
      ["name", "name"],
      ["status", "status"],
      ["address", "address"],
      ["note", "note"],
      ["heroPhotoUrl", "hero_photo_url"],
      ["description", "description"],
      ["rating", "rating"],
      ["userRatingsTotal", "user_ratings_total"],
      ["website", "website"],
    ] as const) {
      if (body[key] !== undefined) {
        fields.push(`${column} = ?`);
        params.push(body[key]);
      }
    }
    if (body.primaryTag !== undefined) {
      fields.push("primary_tag = ?");
      params.push(body.primaryTag);
    }
    if (body.googleTypes !== undefined) {
      fields.push("google_types = ?");
      params.push(JSON.stringify(body.googleTypes));
    }
    if (body.lat !== undefined && body.lng !== undefined) {
      fields.push("lat = ?", "lng = ?", "location = ST_SRID(POINT(?, ?), 0)");
      params.push(body.lat, body.lng, body.lng, body.lat);
    }
    if (fields.length === 0) return reply.code(400).send({ error: "no fields to update" });

    params.push(request.params.id, uid);
    await getPool().query(`UPDATE places SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`, params);

    const [rows] = await getPool().query(`${SELECT} WHERE p.id = ? AND p.user_id = ?`, [
      request.params.id,
      uid,
    ]);
    const list = rows as PlaceRow[];
    if (list.length === 0) return reply.code(404).send({ error: "not found" });
    return serialize(list[0]);
  });

  // Backfills description/rating/website/hours/googleTypes/heroPhotoUrl for a
  // place added before this field set existed — those columns were only ever
  // populated at creation time, so older rows just have them as null.
  app.post<{ Params: { id: string } }>("/:id/refresh", auth, async (request, reply) => {
    const uid = userId(request);
    const [rows] = await getPool().query("SELECT google_place_id AS googlePlaceId FROM places WHERE id = ? AND user_id = ?", [
      request.params.id,
      uid,
    ]);
    const row = (rows as { googlePlaceId: string | null }[])[0];
    if (!row) return reply.code(404).send({ error: "not found" });
    if (!row.googlePlaceId) return reply.code(400).send({ error: "place has no linked Google place to refresh from" });

    const details = await placeDetails(row.googlePlaceId);
    await getPool().query(
      `UPDATE places SET address = ?, hours = ?, hero_photo_url = ?, description = ?, rating = ?, user_ratings_total = ?, website = ?, google_types = ?
       WHERE id = ? AND user_id = ?`,
      [
        details.address,
        details.hours ? JSON.stringify(details.hours) : null,
        details.heroPhotoUrl,
        details.description,
        details.rating,
        details.userRatingsTotal,
        details.website,
        details.googleTypes ? JSON.stringify(details.googleTypes) : null,
        request.params.id,
        uid,
      ],
    );

    const [updated] = await getPool().query(`${SELECT} WHERE p.id = ? AND p.user_id = ?`, [request.params.id, uid]);
    return serialize((updated as PlaceRow[])[0]);
  });

  // Read-only — fetches the full photo set from Google without touching any
  // other stored fields, so the UI can offer a "pick a different photo" grid.
  app.get<{ Params: { id: string } }>("/:id/photos", auth, async (request, reply) => {
    const uid = userId(request);
    const [rows] = await getPool().query("SELECT google_place_id AS googlePlaceId FROM places WHERE id = ? AND user_id = ?", [
      request.params.id,
      uid,
    ]);
    const row = (rows as { googlePlaceId: string | null }[])[0];
    if (!row) return reply.code(404).send({ error: "not found" });
    if (!row.googlePlaceId) return reply.code(400).send({ error: "place has no linked Google place" });

    const details = await placeDetails(row.googlePlaceId);
    return { photos: details.photos };
  });

  app.delete<{ Params: { id: string } }>("/:id", auth, async (request, reply) => {
    await getPool().query("DELETE FROM places WHERE id = ? AND user_id = ?", [
      request.params.id,
      userId(request),
    ]);
    return reply.code(204).send();
  });

  // Ideas tray: link/unlink an existing library place to/from a trip, independent of scheduling.
  app.post<{ Params: { id: string }; Body: { tripId: number } }>("/:id/trips", auth, async (request, reply) => {
    await getPool().query("INSERT IGNORE INTO trip_places (trip_id, place_id) VALUES (?, ?)", [
      request.body.tripId,
      request.params.id,
    ]);
    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string; tripId: string } }>(
    "/:id/trips/:tripId",
    auth,
    async (request, reply) => {
      await getPool().query("DELETE FROM trip_places WHERE trip_id = ? AND place_id = ?", [
        request.params.tripId,
        request.params.id,
      ]);
      return reply.code(204).send();
    },
  );
}
