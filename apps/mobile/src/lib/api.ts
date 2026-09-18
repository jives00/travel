import { createTravelApi } from "@travel/api-client";
import { ProbingBaseUrlResolver } from "./apiBase";
import { SecureStoreTokenStore } from "./tokenStore";

export const tokenStore = new SecureStoreTokenStore();
// Exported so the connectivity manager can health-probe / reset it (the "is home
// reachable?" signal that drives onlineManager and the reconnect sync).
export const baseUrl = new ProbingBaseUrlResolver();

export const travelApi = createTravelApi({ baseUrl, tokenStore });

/** Turns a path the API returned into something an <Image> can load.
 *
 * Uploaded link thumbnails come back as a relative `/api/link-images/…` path so
 * that web — which proxies `/api` through Next — renders them with no special
 * casing. Mobile talks to the API by absolute URL, so it has to prefix them.
 * Anything already absolute (a scraped og:image on someone else's CDN) is
 * returned untouched. Null means the base hasn't been probed yet, not an error.
 */
export function absoluteApiUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  if (/^https?:\/\//i.test(url)) return url;
  const base = baseUrl.resolvedBaseUrl;
  if (!base) return null;
  return `${base.replace(/\/$/, "")}${url}`;
}
