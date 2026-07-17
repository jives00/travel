import "server-only";
import { cookies } from "next/headers";
import { createTravelApi, InMemoryTokenStore, StaticBaseUrlResolver } from "@travel/api-client";

const API_INTERNAL_URL = process.env.API_URL ?? "http://localhost:3008";
const REFRESH_COOKIE = "travel_refreshToken";

/**
 * Server Components need a valid access token to prefetch data, but the access
 * token otherwise lives only in browser memory (InMemoryTokenStore — see lib/api.ts
 * and the spec's "web keeps the access token in memory only" decision). This
 * resolves that: read the httpOnly refresh cookie (available to the Next.js
 * server via next/headers), exchange it for a short-lived access token scoped to
 * *this one request*, and use it for the RSC prefetch. Discarded when the request
 * ends — nothing persists server-side.
 *
 * Calls the API container directly (API_INTERNAL_URL), not through the browser's
 * /api rewrite proxy, since this code never runs in a browser.
 */
export async function getServerApi() {
  const cookieStore = await cookies();
  const refreshToken = cookieStore.get(REFRESH_COOKIE)?.value;
  const tokenStore = new InMemoryTokenStore();

  if (refreshToken) {
    try {
      const res = await fetch(`${API_INTERNAL_URL}/api/auth/refresh`, {
        method: "POST",
        headers: { Cookie: `${REFRESH_COOKIE}=${refreshToken}` },
      });
      if (res.ok) {
        const data = (await res.json()) as { accessToken: string };
        tokenStore.setAccessToken(data.accessToken);
      }
    } catch {
      // Prefetch just comes back empty/unauthenticated; the client-side
      // AuthManager.bootstrap() on hydration is the real source of truth.
    }
  }

  return createTravelApi({
    baseUrl: new StaticBaseUrlResolver(API_INTERNAL_URL),
    tokenStore,
  });
}
