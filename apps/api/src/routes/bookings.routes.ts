import type { FastifyInstance, FastifyRequest } from "fastify";
import { CreateBookingBody, UpdateBookingBody } from "@travel/types";
import { authenticate } from "../middleware/auth";
import { getPool } from "../db";

function userId(request: FastifyRequest): number {
  return (request.user as { sub: number }).sub;
}

const BOOKING_SELECT = `
  SELECT id, trip_id AS tripId, leg_id AS legId, type, title,
         confirmation_code AS confirmationCode, flight_number AS flightNumber,
         start_at AS startAt, end_at AS endAt, price, currency, place_id AS placeId,
         address, lat, lng, notes,
         created_at AS createdAt, updated_at AS updatedAt
  FROM bookings
`;

async function assertOwnsTrip(tripId: string | number, uid: number): Promise<boolean> {
  const [rows] = await getPool().query("SELECT id FROM trips WHERE id = ? AND user_id = ?", [tripId, uid]);
  return (rows as unknown[]).length > 0;
}

export async function bookingsRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate] };

  app.get<{ Params: { tripId: string } }>("/:tripId/bookings", auth, async (request, reply) => {
    if (!(await assertOwnsTrip(request.params.tripId, userId(request))))
      return reply.code(404).send({ error: "not found" });
    const [rows] = await getPool().query(
      `${BOOKING_SELECT} WHERE trip_id = ? ORDER BY start_at IS NULL, start_at`,
      [request.params.tripId],
    );
    return rows;
  });

  app.post<{ Params: { tripId: string } }>("/:tripId/bookings", auth, async (request, reply) => {
    if (!(await assertOwnsTrip(request.params.tripId, userId(request))))
      return reply.code(404).send({ error: "not found" });

    const parsed = CreateBookingBody.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
    const body = parsed.data;

    const [result] = await getPool().query(
      `INSERT INTO bookings (trip_id, leg_id, type, title, confirmation_code, flight_number, start_at, end_at, price, currency, place_id, address, lat, lng, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        request.params.tripId,
        body.legId ?? null,
        body.type,
        body.title,
        body.confirmationCode ?? null,
        body.flightNumber ?? null,
        body.startAt ?? null,
        body.endAt ?? null,
        body.price ?? null,
        body.currency ?? null,
        body.placeId ?? null,
        body.address ?? null,
        body.lat ?? null,
        body.lng ?? null,
        body.notes ?? null,
      ],
    );
    const insertId = (result as { insertId: number }).insertId;
    const [rows] = await getPool().query(`${BOOKING_SELECT} WHERE id = ?`, [insertId]);
    return reply.code(201).send((rows as unknown[])[0]);
  });

  app.patch<{ Params: { tripId: string; bookingId: string } }>(
    "/:tripId/bookings/:bookingId",
    auth,
    async (request, reply) => {
      if (!(await assertOwnsTrip(request.params.tripId, userId(request))))
        return reply.code(404).send({ error: "not found" });

      const parsed = UpdateBookingBody.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send({ error: "invalid body" });
      const body = parsed.data;

      const fields: string[] = [];
      const params: unknown[] = [];
      for (const [key, column] of [
        ["legId", "leg_id"],
        ["type", "type"],
        ["title", "title"],
        ["confirmationCode", "confirmation_code"],
        ["flightNumber", "flight_number"],
        ["startAt", "start_at"],
        ["endAt", "end_at"],
        ["price", "price"],
        ["currency", "currency"],
        ["placeId", "place_id"],
        ["address", "address"],
        ["lat", "lat"],
        ["lng", "lng"],
        ["notes", "notes"],
      ] as const) {
        if (body[key] !== undefined) {
          fields.push(`${column} = ?`);
          params.push(body[key]);
        }
      }
      if (fields.length === 0) return reply.code(400).send({ error: "no fields to update" });
      params.push(request.params.bookingId, request.params.tripId);
      await getPool().query(`UPDATE bookings SET ${fields.join(", ")} WHERE id = ? AND trip_id = ?`, params);

      const [rows] = await getPool().query(`${BOOKING_SELECT} WHERE id = ?`, [request.params.bookingId]);
      return (rows as unknown[])[0];
    },
  );

  app.delete<{ Params: { tripId: string; bookingId: string } }>(
    "/:tripId/bookings/:bookingId",
    auth,
    async (request, reply) => {
      if (!(await assertOwnsTrip(request.params.tripId, userId(request))))
        return reply.code(404).send({ error: "not found" });
      await getPool().query("DELETE FROM bookings WHERE id = ? AND trip_id = ?", [
        request.params.bookingId,
        request.params.tripId,
      ]);
      return reply.code(204).send();
    },
  );
}

// Cross-trip lookups, registered separately (prefix /api/bookings) since — unlike
// every other booking route — these aren't scoped to one trip's :tripId. Only
// hotel bookings carry their own lat/lng (see google-places autocomplete flow
// in bookings-list.tsx), which is what the map view needs.
export async function bookingsGlobalRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate] };

  app.get("/hotels", auth, async (request) => {
    // Not just `${BOOKING_SELECT} JOIN ...` — bookings and trips both have
    // id/created_at/updated_at, which MySQL rejects as ambiguous once both
    // tables are in scope, so every column here is table-qualified instead.
    const [rows] = await getPool().query(
      `SELECT b.id, b.trip_id AS tripId, b.leg_id AS legId, b.type, b.title,
              b.confirmation_code AS confirmationCode, b.flight_number AS flightNumber,
              b.start_at AS startAt, b.end_at AS endAt, b.price, b.currency, b.place_id AS placeId,
              b.address, b.lat, b.lng, b.notes,
              b.created_at AS createdAt, b.updated_at AS updatedAt
       FROM bookings b
       JOIN trips t ON t.id = b.trip_id
       WHERE t.user_id = ? AND b.type = 'hotel' AND b.lat IS NOT NULL AND b.lng IS NOT NULL`,
      [userId(request)],
    );
    return rows;
  });
}
