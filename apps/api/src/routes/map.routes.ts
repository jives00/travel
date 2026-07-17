import type { FastifyInstance, FastifyRequest } from "fastify";
import type { MapCityPoint, MapOverview } from "@travel/types";
import { computeTripStatus, mapBucketForTripStatus } from "@travel/core";
import { authenticate } from "../middleware/auth";
import { getPool } from "../db";
import { geocodeCity } from "../services/weather.client";

function userId(request: FastifyRequest): number {
  return (request.user as { sub: number }).sub;
}

interface TripRow {
  id: number;
  name: string;
  statusOverride: "dreaming" | "planned" | "active" | "past" | null;
}

interface LegRow {
  id: number;
  tripId: number;
  city: string;
  startDate: string | null;
  endDate: string | null;
  lat: number | null;
  lng: number | null;
}

interface DayTripPlaceRow {
  id: number;
  name: string;
  lat: number;
  lng: number;
  tripId: number;
}

export async function mapRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate] };

  app.get("/overview", auth, async (request): Promise<MapOverview> => {
    const uid = userId(request);

    const [tripRows] = await getPool().query(
      "SELECT id, name, status_override AS statusOverride FROM trips WHERE user_id = ? AND archived_at IS NULL",
      [uid],
    );
    const trips = tripRows as TripRow[];
    if (trips.length === 0) {
      const [wishlistRows] = await getPool().query(
        "SELECT id, user_id AS userId, name, type, lat, lng, note, created_at AS createdAt FROM wishlist_locations WHERE user_id = ? ORDER BY created_at DESC",
        [uid],
      );
      return { visited: [], planned: [], wantToVisit: wishlistRows as MapOverview["wantToVisit"] };
    }
    const tripIds = trips.map((t) => t.id);
    const tripById = new Map(trips.map((t) => [t.id, t]));

    const [legRows] = await getPool().query(
      `SELECT id, trip_id AS tripId, city, start_date AS startDate, end_date AS endDate, lat, lng
       FROM legs WHERE trip_id IN (?)`,
      [tripIds],
    );
    const legs = legRows as LegRow[];

    // Group by trip so computeTripStatus (which looks at ALL of a trip's legs
    // together to find the earliest/latest date) gets the full leg set, not
    // just one leg at a time.
    const legsByTrip = new Map<number, LegRow[]>();
    for (const leg of legs) {
      if (!legsByTrip.has(leg.tripId)) legsByTrip.set(leg.tripId, []);
      legsByTrip.get(leg.tripId)!.push(leg);
    }

    function statusForTrip(tripId: number): "dreaming" | "planned" | "active" | "past" {
      const trip = tripById.get(tripId)!;
      if (trip.statusOverride) return trip.statusOverride;
      const tripLegs = legsByTrip.get(tripId) ?? [];
      return computeTripStatus({ legs: tripLegs });
    }

    // Self-healing cache: legs.lat/lng is only ever populated here, lazily, the
    // first time a leg is seen with a free-text city and no coordinates yet.
    const visited: MapCityPoint[] = [];
    const planned: MapCityPoint[] = [];
    for (const leg of legs) {
      let { lat, lng } = leg;
      if (lat == null || lng == null) {
        const geo = await geocodeCity(leg.city).catch(() => null);
        if (!geo) continue;
        lat = geo.lat;
        lng = geo.lng;
        await getPool().query("UPDATE legs SET lat = ?, lng = ? WHERE id = ?", [lat, lng, leg.id]);
      }
      const trip = tripById.get(leg.tripId)!;
      const bucket = mapBucketForTripStatus(statusForTrip(leg.tripId));
      const point: MapCityPoint = {
        id: `leg-${leg.id}`,
        name: leg.city,
        lat,
        lng,
        kind: "leg",
        tripId: leg.tripId,
        tripName: trip.name,
        bucket,
      };
      (bucket === "visited" ? visited : planned).push(point);
    }

    // day_trip-tagged places (e.g. Sitges as a day trip from Barcelona) linked
    // to a trip via the ideas tray (trip_places) — a place may be linked to more
    // than one trip; visited wins over planned when both apply.
    const [dayTripRows] = await getPool().query(
      `SELECT p.id, p.name, p.lat, p.lng, tp.trip_id AS tripId
       FROM places p
       JOIN trip_places tp ON tp.place_id = p.id
       WHERE p.user_id = ? AND p.primary_tag = 'day_trip' AND tp.trip_id IN (?)`,
      [uid, tripIds],
    );
    const bucketByPlaceId = new Map<number, { bucket: "visited" | "planned"; place: DayTripPlaceRow }>();
    for (const row of dayTripRows as DayTripPlaceRow[]) {
      const bucket = mapBucketForTripStatus(statusForTrip(row.tripId));
      const existing = bucketByPlaceId.get(row.id);
      if (!existing || (bucket === "visited" && existing.bucket === "planned")) {
        bucketByPlaceId.set(row.id, { bucket, place: row });
      }
    }
    for (const { bucket, place } of bucketByPlaceId.values()) {
      const trip = tripById.get(place.tripId)!;
      const point: MapCityPoint = {
        id: `place-${place.id}`,
        name: place.name,
        lat: place.lat,
        lng: place.lng,
        kind: "day_trip",
        tripId: place.tripId,
        tripName: trip.name,
        bucket,
      };
      (bucket === "visited" ? visited : planned).push(point);
    }

    const [wishlistRows] = await getPool().query(
      "SELECT id, user_id AS userId, name, type, lat, lng, note, created_at AS createdAt FROM wishlist_locations WHERE user_id = ? ORDER BY created_at DESC",
      [uid],
    );

    return { visited, planned, wantToVisit: wishlistRows as MapOverview["wantToVisit"] };
  });
}
