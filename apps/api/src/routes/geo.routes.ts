import type { FastifyInstance } from "fastify";
import { authenticate } from "../middleware/auth";
import { searchCities } from "../services/weather.client";

/** City search for the leg city picker.
 *
 * Trip-independent — it resolves a name against Open-Meteo, nothing more — so
 * it lives outside /api/trips rather than being bolted onto a leg route it has
 * no relationship with. Authenticated all the same: it is an outbound fetch on
 * the app's behalf, and there is no reason for an unauthenticated caller to be
 * able to drive one.
 */
export async function geoRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { q?: string } }>(
    "/cities",
    { preHandler: [authenticate] },
    async (request) => {
      return searchCities(request.query.q ?? "");
    },
  );
}
