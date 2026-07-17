import type { BaseUrlResolver } from "./baseUrl";
import type { TokenStore } from "./tokenStore";

export class ApiError extends Error {
  constructor(
    public status: number,
    public path: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
}

const NO_RETRY_PATHS = new Set(["/api/auth/login", "/api/auth/refresh", "/api/auth/session"]);

export interface ApiClientConfig {
  baseUrl: BaseUrlResolver;
  tokenStore: TokenStore;
  /** Refreshes the access token and returns the new one. Dedup'd by AuthManager —
   * this client just calls it and retries once on 401. */
  refreshAccessToken: () => Promise<string>;
}

function buildUrl(base: string, path: string, query?: RequestOptions["query"]): string {
  const url = new URL(path, base.startsWith("http") ? base : `http://placeholder${base}`);
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  // strip the placeholder origin back out for relative (web) base URLs
  return base.startsWith("http") ? url.toString() : `${base}${path}${url.search}`;
}

/** One typed client, two hosts — the request() wrapper centralizes auth headers,
 * credentials, and the 401 -> refresh -> retry-once dance. Every endpoint method
 * is a thin call into this. */
export function createApiClient(config: ApiClientConfig) {
  async function rawRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const base = await config.baseUrl.getBaseUrl();
    const url = buildUrl(base, path, options.query);
    const token = config.tokenStore.getAccessToken();

    const headers: Record<string, string> = {};
    if (options.body !== undefined) headers["Content-Type"] = "application/json";
    if (token) headers.Authorization = `Bearer ${token}`;

    const res = await fetch(url, {
      method: options.method ?? "GET",
      headers,
      credentials: "include",
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });

    if (res.status === 401 && !NO_RETRY_PATHS.has(path) && token) {
      const newToken = await config.refreshAccessToken();
      const retryRes = await fetch(url, {
        method: options.method ?? "GET",
        headers: { ...headers, Authorization: `Bearer ${newToken}` },
        credentials: "include",
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
      return handleResponse<T>(retryRes, path);
    }

    return handleResponse<T>(res, path);
  }

  return { request: rawRequest };
}

async function handleResponse<T>(res: Response, path: string): Promise<T> {
  if (!res.ok) {
    const message = await res.text().catch(() => res.statusText);
    throw new ApiError(res.status, path, message || res.statusText);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}
