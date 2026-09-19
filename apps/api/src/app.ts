import Fastify, { type FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import jwt from "@fastify/jwt";
import compress from "@fastify/compress";
import multipart from "@fastify/multipart";

import { healthRoutes } from "./routes/health.routes";
import { authRoutes } from "./routes/auth.routes";
import { appVersionRoutes } from "./routes/app-version.routes";
import { placesRoutes } from "./routes/places.routes";
import { tripsRoutes } from "./routes/trips.routes";
import { legsRoutes } from "./routes/legs.routes";
import { itineraryRoutes } from "./routes/itinerary.routes";
import { dayNotesRoutes } from "./routes/day-notes.routes";
import { tripLinksRoutes } from "./routes/trip-links.routes";
import { recapRoutes } from "./routes/recap.routes";
import { linkImagesRoutes } from "./routes/link-images.routes";
import { readinessRoutes } from "./routes/readiness.routes";
import { bookingsRoutes, bookingsGlobalRoutes } from "./routes/bookings.routes";
import { expensesRoutes } from "./routes/expenses.routes";
import { listsRoutes } from "./routes/lists.routes";
import { settingsRoutes } from "./routes/settings.routes";
import { fundingSourcesRoutes } from "./routes/funding-sources.routes";
import { mapRoutes } from "./routes/map.routes";
import { geoRoutes } from "./routes/geo.routes";
import { wishlistRoutes } from "./routes/wishlist.routes";
import { exportRoutes } from "./routes/export.routes";

export function buildApp(): FastifyInstance {
  const app = Fastify({
    // "warn" hides every request line *and* every 4xx reply, which makes a
    // client that's silently failing (401s it swallows, a body the schema
    // rejects) invisible from the server side. "info" logs one req/res pair per
    // call — cheap for a single-user app, and the only way to see what a phone
    // is actually sending. LOG_LEVEL overrides it without a rebuild.
    logger: { level: process.env.LOG_LEVEL ?? "info", transport: { target: "pino-pretty" } },
    trustProxy: true,
    // find-my-way's default maxParamLength is 100 — Google Places API (New)
    // place IDs routinely run 100-150+ chars, so any :placeId route param over
    // that silently 404'd (confirmed empirically: 100 chars matched, 101 didn't).
    maxParamLength: 512,
  });

  void app.register(helmet);
  // Sensitive endpoints are JWT-protected; cookies carry the refresh token same-origin
  // via the web app's rewrite proxy, so a permissive CORS origin is safe here.
  void app.register(cors, { origin: true, credentials: true });
  void app.register(cookie);
  void app.register(jwt, { secret: process.env.JWT_SECRET ?? "dev-secret-change-me" });
  void app.register(compress); // §0.1 performance requirement — gzip/brotli on API responses
  // Uploaded link thumbnails (trip_links). The per-route limit is what
  // actually enforces the size cap; this is the parser, not the policy.
  void app.register(multipart);

  void app.register(healthRoutes); // no /api prefix — devdash + mobile probe
  void app.register(authRoutes, { prefix: "/api/auth" });
  void app.register(appVersionRoutes, { prefix: "/api/app/version" });
  void app.register(placesRoutes, { prefix: "/api/places" });
  void app.register(tripsRoutes, { prefix: "/api/trips" });
  void app.register(legsRoutes, { prefix: "/api/trips" }); // /api/trips/:tripId/legs/*
  void app.register(itineraryRoutes, { prefix: "/api/trips" }); // /api/trips/:tripId/itinerary/*
  void app.register(dayNotesRoutes, { prefix: "/api/trips" }); // /api/trips/:tripId/day-notes/*
  void app.register(tripLinksRoutes, { prefix: "/api/trips" }); // /api/trips/:tripId/links/*
  void app.register(recapRoutes, { prefix: "/api/trips" }); // /api/trips/:tripId/recap/*
  void app.register(linkImagesRoutes, { prefix: "/api/link-images" }); // unauthenticated; see the route
  void app.register(readinessRoutes, { prefix: "/api/trips" }); // /api/trips/:tripId/readiness/*
  void app.register(bookingsRoutes, { prefix: "/api/trips" }); // /api/trips/:tripId/bookings/*
  void app.register(bookingsGlobalRoutes, { prefix: "/api/bookings" }); // /api/bookings/hotels
  void app.register(expensesRoutes, { prefix: "/api/trips" }); // /api/trips/:tripId/expenses/*, /budget
  void app.register(listsRoutes, { prefix: "/api/lists" });
  void app.register(settingsRoutes, { prefix: "/api/settings" });
  void app.register(fundingSourcesRoutes, { prefix: "/api/funding-sources" });
  void app.register(mapRoutes, { prefix: "/api/map" });
  void app.register(geoRoutes, { prefix: "/api/geo" }); // /api/geo/cities — leg city picker
  void app.register(wishlistRoutes, { prefix: "/api/wishlist" });
  void app.register(exportRoutes, { prefix: "/api/trips" }); // /api/trips/:tripId/export/*

  return app;
}
