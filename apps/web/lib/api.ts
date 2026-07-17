"use client";

import { createTravelApi, InMemoryTokenStore, StaticBaseUrlResolver } from "@travel/api-client";

// Empty base, NOT "/api" — every endpoint path in packages/api-client already
// includes the "/api/..." prefix itself (e.g. request("/api/places", ...)), and
// AuthManager's raw fetches build "${base}/api/auth/..." the same way. A base of
// "/api" here double-prefixed every call to "/api/api/...". Next's rewrite proxy
// (next.config.mjs, basePath:false on that rule) still forwards plain "/api/..."
// to the API container, keeping the refresh cookie same-origin regardless of the
// app's own /travel basePath — the empty base just means "resolve against the
// current origin," which for a relative path already achieves that.
const tokenStore = new InMemoryTokenStore();
const baseUrl = new StaticBaseUrlResolver("");

export const travelApi = createTravelApi({ baseUrl, tokenStore });
