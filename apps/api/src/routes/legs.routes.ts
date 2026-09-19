import type { FastifyInstance, FastifyRequest } from "fastify";
import { CreateLegBody, ReorderLegsBody, UpdateLegBody } from "@travel/types";
import { authenticate } from "../middleware/auth";
import { getPool } from "../db";
import type { CityCandidate } from "@travel/types";
import { geocodeCity } from "../services/weather.client";

function userId(request: FastifyRequest): number {
  return (request.user as { sub: number }).sub;
}

const LEG_SELECT = `
  SELECT id, trip_id AS tripId, sort_order AS sortOrder, city,
         start_date AS startDate, end_date AS endDate, day_count AS dayCount,
         lodging_place_id AS lodgingPlaceId, currency, timezone,
         lat, lng, country, country_code AS countryCode,
         created_at AS createdAt, updated_at AS updatedAt
  FROM legs
`;

/** Legs read out chronologically: start date, then end date, with sort_order as
 * the tiebreaker. Undated legs (dreaming trips) sink below every dated one.
 * Mirrors compareLegs in @travel/core, which the clients sort their copies with. */
const LEG_ORDER = "ORDER BY start_date IS NULL, start_date, end_date IS NULL, end_date, sort_order";

/** Everything a leg derives from where its city *is* — resolved whenever the
 * city is written rather than asked of the user.
 *
 * Two ways in. If the client sends a `geo` (the user picked from the city
 * search) it is taken verbatim: that is a statement about which Córdoba, and
 * guessing over the top of it would defeat the picker. Otherwise the name is
 * geocoded here, which takes the top hit and can be wrong — never fatal, since
 * a miss or an Open-Meteo outage just leaves the columns null and `backfillLegGeo`
 * retries on the next read.
 *
 * Columns are always returned as a complete set, nulls included, because the
 * caller writes them on a city *change*: a half-written set would leave the new
 * city wearing the old one's coordinates, which is how a leg ends up plotted an
 * ocean away from its own timezone. */
interface LegGeoColumns {
  timezone: string | null;
  lat: number | null;
  lng: number | null;
  country: string | null;
  countryCode: string | null;
}

async function geoForCity(city: string, picked: CityCandidate | undefined): Promise<LegGeoColumns> {
  const geo = picked ?? (await geocodeCity(city).catch(() => null));
  return {
    timezone: geo?.timezone ?? null,
    lat: geo?.lat ?? null,
    lng: geo?.lng ?? null,
    country: geo?.country ?? null,
    countryCode: geo?.countryCode ?? null,
  };
}

const GEO_COLUMNS = ["timezone", "lat", "lng", "country", "country_code"] as const;

function geoValues(geo: LegGeoColumns): unknown[] {
  return [geo.timezone, geo.lat, geo.lng, geo.country, geo.countryCode];
}

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

    const geo = await geoForCity(body.city, body.geo);
    const [result] = await getPool().query(
      `INSERT INTO legs (trip_id, sort_order, city, start_date, end_date, day_count, lodging_place_id, currency,
                         ${GEO_COLUMNS.join(", ")})
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ${GEO_COLUMNS.map(() => "?").join(", ")})`,
      [
        request.params.tripId,
        maxOrder + 1,
        body.city,
        body.startDate ?? null,
        body.endDate ?? null,
        body.dayCount ?? null,
        body.lodgingPlaceId ?? null,
        body.currency ?? null,
        ...geoValues(geo),
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
      // Renaming the city moves the leg somewhere else, so *every* derived
      // column is stale — not just the zone, which is all this used to rewrite,
      // leaving the new city sitting on the old one's coordinates and country.
      // Written even when the lookup fails: nulls are re-resolved on the next
      // read by backfillLegGeo, a stale value never is.
      //
      // Also runs for a `geo` sent without a `city` — picking the right Córdoba
      // for a leg already named "Cordoba" is the whole repair path.
      if (body.city !== undefined || body.geo !== undefined) {
        const geo = await geoForCity(body.city ?? "", body.geo);
        fields.push(...GEO_COLUMNS.map((c) => `${c} = ?`));
        params.push(...geoValues(geo));
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

    const [rows] = await getPool().query(`${LEG_SELECT} WHERE trip_id = ? ${LEG_ORDER}`, [
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
