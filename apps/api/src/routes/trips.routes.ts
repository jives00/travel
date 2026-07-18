import type { FastifyInstance, FastifyRequest } from "fastify";
import { CreateTripBody, SelectListImageBody, UpdateTripBody } from "@travel/types";
import { computeTripStatus } from "@travel/core";
import { authenticate } from "../middleware/auth";
import { getPool } from "../db";
import { pingCityPhotoDownload, searchCityPhoto, searchCityPhotoOptions } from "../services/unsplash.client";
import { getCityForecast, type CityForecast } from "../services/weather.client";

function userId(request: FastifyRequest): number {
  return (request.user as { sub: number }).sub;
}

interface LegRow {
  id: number;
  tripId: number;
  sortOrder: number;
  city: string;
  startDate: string | null;
  endDate: string | null;
  dayCount: number | null;
  lodgingPlaceId: number | null;
  currency: string | null;
  createdAt: string;
  updatedAt: string;
}

interface TripRow {
  id: number;
  userId: number;
  name: string;
  heroImageUrl: string | null;
  listImageUrl: string | null;
  listImagePhotographerName: string | null;
  listImagePhotographerUrl: string | null;
  homeCurrency: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  statusOverride: "dreaming" | "planned" | "active" | "past" | null;
  isPrimary: number;
}

const TRIP_SELECT = `
  SELECT id, user_id AS userId, name, hero_image_url AS heroImageUrl,
         list_image_url AS listImageUrl, list_image_photographer_name AS listImagePhotographerName,
         list_image_photographer_url AS listImagePhotographerUrl, home_currency AS homeCurrency,
         archived_at AS archivedAt, created_at AS createdAt, updated_at AS updatedAt,
         status_override AS statusOverride, is_primary AS isPrimary
  FROM trips
`;

const LEG_SELECT = `
  SELECT id, trip_id AS tripId, sort_order AS sortOrder, city,
         start_date AS startDate, end_date AS endDate, day_count AS dayCount,
         lodging_place_id AS lodgingPlaceId, currency,
         created_at AS createdAt, updated_at AS updatedAt
  FROM legs
`;

async function legsForTrip(tripId: number): Promise<LegRow[]> {
  const [rows] = await getPool().query(`${LEG_SELECT} WHERE trip_id = ? ORDER BY sort_order`, [tripId]);
  return rows as LegRow[];
}

async function withLegsAndStatus(trip: TripRow) {
  const legs = await legsForTrip(trip.id);
  return {
    ...trip,
    isPrimary: Boolean(trip.isPrimary),
    legs,
    // manual override wins over the computed status (spec addition: the user
    // can pin a trip's status by hand rather than always deriving it from dates).
    status: trip.statusOverride ?? computeTripStatus({ legs }),
  };
}

export async function tripsRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate] };

  app.get<{ Querystring: { archived?: string } }>("/", auth, async (request) => {
    const wantArchived = request.query.archived === "true";
    const [rows] = await getPool().query(
      `${TRIP_SELECT} WHERE user_id = ? AND archived_at IS ${wantArchived ? "NOT NULL" : "NULL"} ORDER BY name`,
      [userId(request)],
    );
    return Promise.all((rows as TripRow[]).map(withLegsAndStatus));
  });

  // Trip-home hero photo: sourced from the first leg's city, fresh on every call
  // (no persistence into hero_image_url — the user explicitly wants variety on
  // each page load rather than a cached photo pinned once).
  app.get<{ Params: { id: string } }>("/:id/hero-image", auth, async (request, reply) => {
    const [rows] = await getPool().query(`${TRIP_SELECT} WHERE id = ? AND user_id = ?`, [
      request.params.id,
      userId(request),
    ]);
    const trip = (rows as TripRow[])[0];
    if (!trip) return reply.code(404).send({ error: "not found" });

    const legs = await legsForTrip(trip.id);
    const firstLeg = [...legs].sort((a, b) => a.sortOrder - b.sortOrder)[0];
    if (!firstLeg) return { url: null, city: null, photographerName: null, photographerUrl: null };

    const photo = await searchCityPhoto(firstLeg.city).catch(() => null);
    return {
      url: photo?.url ?? null,
      city: firstLeg.city,
      photographerName: photo?.photographerName ?? null,
      photographerUrl: photo?.photographerUrl ?? null,
    };
  });

  // Unlike /:id/hero-image (fresh every call, never saved), this one persists
  // the pick into list_image_url — the trips-list grid wants a fixed
  // thumbnail, not a re-roll on every page load. Used both to auto-fill a
  // trip's card the first time it's seen and for an explicit "change photo".
  app.post<{ Params: { id: string } }>("/:id/list-image", auth, async (request, reply) => {
    const [rows] = await getPool().query(`${TRIP_SELECT} WHERE id = ? AND user_id = ?`, [
      request.params.id,
      userId(request),
    ]);
    const trip = (rows as TripRow[])[0];
    if (!trip) return reply.code(404).send({ error: "not found" });

    const legs = await legsForTrip(trip.id);
    const firstLeg = [...legs].sort((a, b) => a.sortOrder - b.sortOrder)[0];
    if (!firstLeg) return reply.code(400).send({ error: "trip has no city to search a photo for" });

    const photo = await searchCityPhoto(firstLeg.city).catch(() => null);
    if (!photo) return reply.code(502).send({ error: "no photo found" });

    await getPool().query(
      "UPDATE trips SET list_image_url = ?, list_image_photographer_name = ?, list_image_photographer_url = ? WHERE id = ? AND user_id = ?",
      [photo.url, photo.photographerName, photo.photographerUrl, request.params.id, userId(request)],
    );

    const [updated] = await getPool().query(`${TRIP_SELECT} WHERE id = ? AND user_id = ?`, [
      request.params.id,
      userId(request),
    ]);
    return withLegsAndStatus((updated as TripRow[])[0]);
  });

  // Candidates for the "pick a photo" grid — read-only, doesn't touch the
  // trip record (selection happens via /:id/list-image/select below).
  app.get<{ Params: { id: string } }>("/:id/list-image-options", auth, async (request, reply) => {
    const [rows] = await getPool().query(`${TRIP_SELECT} WHERE id = ? AND user_id = ?`, [
      request.params.id,
      userId(request),
    ]);
    const trip = (rows as TripRow[])[0];
    if (!trip) return reply.code(404).send({ error: "not found" });

    const legs = await legsForTrip(trip.id);
    const firstLeg = [...legs].sort((a, b) => a.sortOrder - b.sortOrder)[0];
    if (!firstLeg) return { city: null, options: [] };

    const options = await searchCityPhotoOptions(firstLeg.city).catch(() => []);
    return { city: firstLeg.city, options };
  });

  // Persists whichever candidate the user picked from that grid, pinging
  // Unsplash's download endpoint at the moment it's actually used.
  app.post<{ Params: { id: string } }>("/:id/list-image/select", auth, async (request, reply) => {
    const parsed = SelectListImageBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const body = parsed.data;

    await pingCityPhotoDownload(body.downloadLocation);
    await getPool().query(
      "UPDATE trips SET list_image_url = ?, list_image_photographer_name = ?, list_image_photographer_url = ? WHERE id = ? AND user_id = ?",
      [body.url, body.photographerName, body.photographerUrl, request.params.id, userId(request)],
    );

    const [rows] = await getPool().query(`${TRIP_SELECT} WHERE id = ? AND user_id = ?`, [
      request.params.id,
      userId(request),
    ]);
    const list = rows as TripRow[];
    if (list.length === 0) return reply.code(404).send({ error: "not found" });
    return withLegsAndStatus(list[0]);
  });

  // Weather for each of the next 4 calendar days, using whichever leg covers
  // that specific day — so a trip that changes cities mid-window shows each
  // day's actual destination instead of freezing on the first city. A day
  // with no covering leg (trip hasn't started, or is between dated legs)
  // previews the next leg still to come; a dreaming trip with no dates at
  // all just uses its first leg for every day. No forecast for a trip whose
  // dated legs are all in the past (nothing to forecast).
  app.get<{ Params: { id: string } }>("/:id/weather", auth, async (request, reply) => {
    const [rows] = await getPool().query(`${TRIP_SELECT} WHERE id = ? AND user_id = ?`, [
      request.params.id,
      userId(request),
    ]);
    const trip = (rows as TripRow[])[0];
    if (!trip) return reply.code(404).send({ error: "not found" });

    const legs = await legsForTrip(trip.id);
    const sorted = [...legs].sort((a, b) => a.sortOrder - b.sortOrder);
    if (sorted.length === 0) return { city: null, days: [] };

    const dated = sorted.filter((l) => l.startDate && l.endDate);

    function cityForDate(date: string): string | null {
      const covering = dated.find((l) => l.startDate! <= date && date <= l.endDate!);
      if (covering) return covering.city;
      const upcoming = dated
        .filter((l) => l.startDate! > date)
        .sort((a, b) => a.startDate!.localeCompare(b.startDate!))[0];
      if (upcoming) return upcoming.city;
      if (dated.length === 0) return sorted[0].city;
      return null;
    }

    const todayUtc = new Date();
    const dayCities = Array.from({ length: 4 }, (_, i) => {
      const d = new Date(todayUtc);
      d.setUTCDate(d.getUTCDate() + i);
      return d.toISOString().slice(0, 10);
    })
      .map((date) => ({ date, city: cityForDate(date) }))
      .filter((d): d is { date: string; city: string } => d.city !== null);
    if (dayCities.length === 0) return { city: null, days: [] };

    const uniqueCities = [...new Set(dayCities.map((d) => d.city))];
    const forecastByCity = new Map<string, CityForecast | null>();
    await Promise.all(
      uniqueCities.map(async (city) => {
        forecastByCity.set(city, await getCityForecast(city).catch(() => null));
      }),
    );

    const days = dayCities
      .map(({ date, city }) => {
        const forecast = forecastByCity.get(city);
        const match = forecast?.days.find((d) => d.date === date);
        return match ? { ...match, city: forecast!.city } : null;
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);

    return { city: days[0]?.city ?? null, days };
  });

  app.get<{ Params: { id: string } }>("/:id", auth, async (request, reply) => {
    const [rows] = await getPool().query(`${TRIP_SELECT} WHERE id = ? AND user_id = ?`, [
      request.params.id,
      userId(request),
    ]);
    const list = rows as TripRow[];
    if (list.length === 0) return reply.code(404).send({ error: "not found" });
    return withLegsAndStatus(list[0]);
  });

  app.post("/", auth, async (request, reply) => {
    const parsed = CreateTripBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const body = parsed.data;

    const [result] = await getPool().query(
      "INSERT INTO trips (user_id, name, hero_image_url, home_currency) VALUES (?, ?, ?, ?)",
      [userId(request), body.name, body.heroImageUrl ?? null, body.homeCurrency ?? null],
    );
    const insertId = (result as { insertId: number }).insertId;
    const [rows] = await getPool().query(`${TRIP_SELECT} WHERE id = ?`, [insertId]);
    return reply.code(201).send(await withLegsAndStatus((rows as TripRow[])[0]));
  });

  app.patch<{ Params: { id: string } }>("/:id", auth, async (request, reply) => {
    const parsed = UpdateTripBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const body = parsed.data;

    const fields: string[] = [];
    const params: unknown[] = [];
    for (const [key, column] of [
      ["name", "name"],
      ["heroImageUrl", "hero_image_url"],
      ["listImageUrl", "list_image_url"],
      ["listImagePhotographerName", "list_image_photographer_name"],
      ["listImagePhotographerUrl", "list_image_photographer_url"],
      ["homeCurrency", "home_currency"],
      ["statusOverride", "status_override"],
    ] as const) {
      if (body[key] !== undefined) {
        fields.push(`${column} = ?`);
        params.push(body[key]);
      }
    }
    if (fields.length === 0) return reply.code(400).send({ error: "no fields to update" });
    params.push(request.params.id, userId(request));
    await getPool().query(`UPDATE trips SET ${fields.join(", ")} WHERE id = ? AND user_id = ?`, params);

    const [rows] = await getPool().query(`${TRIP_SELECT} WHERE id = ? AND user_id = ?`, [
      request.params.id,
      userId(request),
    ]);
    const list = rows as TripRow[];
    if (list.length === 0) return reply.code(404).send({ error: "not found" });
    return withLegsAndStatus(list[0]);
  });

  // Soft delete / archive — never a hard cascade delete (spec decision).
  app.post<{ Params: { id: string } }>("/:id/archive", auth, async (request, reply) => {
    await getPool().query("UPDATE trips SET archived_at = NOW() WHERE id = ? AND user_id = ?", [
      request.params.id,
      userId(request),
    ]);
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>("/:id/restore", auth, async (request, reply) => {
    await getPool().query("UPDATE trips SET archived_at = NULL WHERE id = ? AND user_id = ?", [
      request.params.id,
      userId(request),
    ]);
    return reply.code(204).send();
  });

  // At most one trip can be primary at a time — this is the tiebreaker the Home
  // page uses when it can't otherwise tell which trip to show (e.g. more than
  // one has an active status, whether computed or manually overridden).
  app.post<{ Params: { id: string } }>("/:id/primary", auth, async (request, reply) => {
    const conn = await getPool().getConnection();
    try {
      await conn.beginTransaction();
      await conn.query("UPDATE trips SET is_primary = 0 WHERE user_id = ?", [userId(request)]);
      const [result] = await conn.query("UPDATE trips SET is_primary = 1 WHERE id = ? AND user_id = ?", [
        request.params.id,
        userId(request),
      ]);
      await conn.commit();
      if ((result as { affectedRows: number }).affectedRows === 0) return reply.code(404).send({ error: "not found" });
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }

    const [rows] = await getPool().query(`${TRIP_SELECT} WHERE id = ? AND user_id = ?`, [
      request.params.id,
      userId(request),
    ]);
    return withLegsAndStatus((rows as TripRow[])[0]);
  });

  app.post<{ Params: { id: string } }>("/:id/primary/clear", auth, async (request, reply) => {
    await getPool().query("UPDATE trips SET is_primary = 0 WHERE id = ? AND user_id = ?", [
      request.params.id,
      userId(request),
    ]);
    const [rows] = await getPool().query(`${TRIP_SELECT} WHERE id = ? AND user_id = ?`, [
      request.params.id,
      userId(request),
    ]);
    const list = rows as TripRow[];
    if (list.length === 0) return reply.code(404).send({ error: "not found" });
    return withLegsAndStatus(list[0]);
  });
}
