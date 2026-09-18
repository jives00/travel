import type { FastifyInstance, FastifyRequest } from "fastify";
import type { LegWeather } from "@travel/types";
import { authenticate } from "../middleware/auth";
import { getPool } from "../db";
import { backfillLegGeo } from "../services/legGeo";
import { getPastWeatherSummary } from "../services/weather.client";

function userId(request: FastifyRequest): number {
  return (request.user as { sub: number }).sub;
}

async function assertOwnsTrip(tripId: string, uid: number): Promise<boolean> {
  const [rows] = await getPool().query("SELECT id FROM trips WHERE id = ? AND user_id = ?", [tripId, uid]);
  return (rows as unknown[]).length > 0;
}

interface LegRow {
  id: number;
  city: string;
  startDate: string | null;
  endDate: string | null;
  timezone: string | null;
  lat: number | null;
  lng: number | null;
  country: string | null;
  countryCode: string | null;
}

interface CacheRow {
  legId: number;
  startDate: string;
  endDate: string;
  avgHighF: number;
  avgLowF: number;
  dominantCondition: string;
  precipDays: number;
  dayCount: number;
  isComplete: number;
}

function dayOf(d: string): string {
  return d.length > 10 ? d.slice(0, 10) : d;
}

function inclusiveDays(start: string, end: string): number {
  return Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${start}T00:00:00Z`)) / 86_400_000) + 1;
}

/** What the weather actually was, one summary per city.
 *
 * Split out from the recap itself because it's the only part that isn't derived
 * from rows the app already has: it needs a provider call, and it's the only
 * thing in the recap worth caching (past weather never changes — see migration
 * 037). Everything else the recap shows is computed client-side by
 * `computeRecap` in @travel/core from queries both platforms already hold.
 */
export async function recapRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate] };

  app.get<{ Params: { tripId: string } }>("/:tripId/recap/weather", auth, async (request, reply) => {
    if (!(await assertOwnsTrip(request.params.tripId, userId(request))))
      return reply.code(404).send({ error: "not found" });

    const [legRows] = await getPool().query(
      `SELECT id, city, start_date AS startDate, end_date AS endDate, timezone,
              lat, lng, country, country_code AS countryCode
         FROM legs WHERE trip_id = ?`,
      [request.params.tripId],
    );
    const legs = legRows as LegRow[];
    // The archive call needs coordinates, so a leg that has never been
    // geocoded gets filled here first — same shared lazy backfill as everywhere.
    await backfillLegGeo(legs);

    const dated = legs.filter(
      (l): l is LegRow & { startDate: string; endDate: string; lat: number; lng: number } =>
        l.startDate != null && l.endDate != null && l.lat != null && l.lng != null,
    );
    if (dated.length === 0) return [];

    const [cacheRows] = await getPool().query(
      `SELECT leg_id AS legId, start_date AS startDate, end_date AS endDate,
              avg_high_f AS avgHighF, avg_low_f AS avgLowF,
              dominant_condition AS dominantCondition, precip_days AS precipDays,
              day_count AS dayCount, is_complete AS isComplete
         FROM leg_weather WHERE leg_id IN (?)`,
      [dated.map((l) => l.id)],
    );
    const cached = new Map((cacheRows as CacheRow[]).map((r) => [r.legId, r]));

    const results = await Promise.all(
      dated.map(async (leg) => {
        const start = dayOf(leg.startDate);
        const end = dayOf(leg.endDate);
        const hit = cached.get(leg.id);

        // A cached row is only usable if it describes *these* dates and is
        // complete. Editing a leg's dates invalidates it; an incomplete one is
        // retried until the archive catches up (see migration 037).
        if (hit && dayOf(hit.startDate) === start && dayOf(hit.endDate) === end && hit.isComplete) {
          return {
            legId: leg.id,
            city: leg.city,
            avgHighF: Math.round(hit.avgHighF),
            avgLowF: Math.round(hit.avgLowF),
            dominantCondition: hit.dominantCondition,
            precipDays: hit.precipDays,
            dayCount: hit.dayCount,
            isComplete: true,
          } satisfies LegWeather;
        }

        const expected = inclusiveDays(start, end);
        const summary = await getPastWeatherSummary(leg.lat, leg.lng, start, end, expected).catch(
          () => null,
        );
        if (!summary) return null;

        await getPool().query(
          `INSERT INTO leg_weather
             (leg_id, start_date, end_date, avg_high_f, avg_low_f, dominant_condition,
              precip_days, day_count, is_complete, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE
             start_date = VALUES(start_date), end_date = VALUES(end_date),
             avg_high_f = VALUES(avg_high_f), avg_low_f = VALUES(avg_low_f),
             dominant_condition = VALUES(dominant_condition), precip_days = VALUES(precip_days),
             day_count = VALUES(day_count), is_complete = VALUES(is_complete), fetched_at = NOW()`,
          [
            leg.id,
            start,
            end,
            summary.avgHighF,
            summary.avgLowF,
            summary.dominantCondition,
            summary.precipDays,
            summary.dayCount,
            summary.isComplete ? 1 : 0,
          ],
        );

        return { legId: leg.id, city: leg.city, ...summary } satisfies LegWeather;
      }),
    );

    return results.filter((r): r is LegWeather => r !== null);
  });
}
