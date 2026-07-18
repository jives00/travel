import type { BaseUrlResolver } from "./baseUrl";
import type { TokenStore } from "./tokenStore";

/** The server was reachable and *rejected* our credentials (401/403) — a genuine
 * logged-out state. This is the ONLY failure that should flip auth to false. */
export class AuthRejectedError extends Error {
  constructor() {
    super("auth rejected");
    this.name = "AuthRejectedError";
  }
}

/** We could not reach the server at all (offline, or the NAS is powered off).
 * Emphatically NOT a logged-out state — the user still holds a valid refresh
 * token, they just can't talk to the server right now (e.g. traveling with the
 * home NAS down). Callers must keep the session and run off the cache. */
export class NetworkUnreachableError extends Error {
  constructor() {
    super("network unreachable");
    this.name = "NetworkUnreachableError";
  }
}

/** Framework-free token lifecycle: silent refresh, dedup'd concurrent refreshes,
 * a 10-minute proactive refresh loop (safely inside the 15m JWT expiry), and a
 * foreground-resume hook for mobile. Each platform wraps this in a thin React
 * context rather than re-implementing the lifecycle.
 *
 * Offline-first invariant: a refresh that fails because the server is unreachable
 * NEVER logs the user out (throws NetworkUnreachableError, no notify). Only a
 * reachable server rejecting the refresh token (AuthRejectedError) clears auth. */
export class AuthManager {
  private refreshPromise: Promise<string> | null = null;
  private proactiveInterval: ReturnType<typeof setInterval> | null = null;
  private listeners = new Set<(authenticated: boolean) => void>();

  constructor(
    private readonly baseUrl: BaseUrlResolver,
    private readonly tokenStore: TokenStore,
  ) {}

  onAuthChange(listener: (authenticated: boolean) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(authenticated: boolean): void {
    for (const l of this.listeners) l(authenticated);
  }

  /** Dedup'd — concurrent 401s from several in-flight requests share one refresh call. */
  async refreshAccessToken(): Promise<string> {
    if (!this.refreshPromise) {
      this.refreshPromise = this.doRefresh().finally(() => {
        this.refreshPromise = null;
      });
    }
    return this.refreshPromise;
  }

  private async doRefresh(): Promise<string> {
    // getBaseUrl() rejects on mobile when no base is reachable (NAS down) — that
    // is a network condition, not an auth failure, so surface it as such.
    let base: string;
    let res: Response;
    try {
      base = await this.baseUrl.getBaseUrl();
      const refreshToken = await this.tokenStore.getRefreshToken(); // null on web — cookie carries it
      res = await fetch(`${base}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: refreshToken ? { "Content-Type": "application/json" } : {},
        body: refreshToken ? JSON.stringify({ refreshToken }) : undefined,
      });
    } catch {
      // fetch threw (DNS/connection) or getBaseUrl found nothing reachable.
      // Do NOT notify(false): the session is still valid, we just can't reach home.
      throw new NetworkUnreachableError();
    }
    if (!res.ok) {
      // A reachable server that answers 401/403 means our refresh token is truly
      // dead (expired past 30d, or revoked) — the one case that logs us out.
      if (res.status === 401 || res.status === 403) {
        this.notify(false);
        throw new AuthRejectedError();
      }
      // 5xx / other: server is up but unhappy — treat as transient, don't log out.
      throw new NetworkUnreachableError();
    }
    const data = (await res.json()) as { accessToken: string };
    this.tokenStore.setAccessToken(data.accessToken);
    this.notify(true);
    return data.accessToken;
  }

  /** App-start bootstrap: try silent refresh, fall back to the passwordless
   * trusted-network /session login before giving up.
   *
   * Offline-first: if the server is unreachable but we still hold a refresh
   * token (the traveling-with-NAS-down cold start), stay optimistically
   * authenticated and render from the persisted cache. Only a reachable server
   * rejecting us, or having no credentials at all, is a real logged-out state. */
  async bootstrap(): Promise<boolean> {
    try {
      await this.refreshAccessToken();
      return true;
    } catch (err) {
      if (err instanceof NetworkUnreachableError) {
        // Can't reach home. If we have a stored refresh token, we're still
        // "logged in" — run off cache; a later reconnect will refresh for real.
        const hasRefresh = (await this.tokenStore.getRefreshToken()) != null;
        if (hasRefresh) {
          this.notify(true);
          return true;
        }
        // No stored token and offline — nothing we can do until reconnect.
        return false;
      }
      // AuthRejectedError (or anything else): try the trusted-network session,
      // then give up.
      try {
        await this.trustedNetworkSession();
        return true;
      } catch {
        return false;
      }
    }
  }

  private async trustedNetworkSession(): Promise<void> {
    const base = await this.baseUrl.getBaseUrl();
    const res = await fetch(`${base}/api/auth/session`, { method: "POST", credentials: "include" });
    if (!res.ok) throw new Error("no trusted session");
    const data = (await res.json()) as { accessToken: string };
    this.tokenStore.setAccessToken(data.accessToken);
    this.notify(true);
  }

  startProactiveRefresh(intervalMs = 10 * 60 * 1000): void {
    this.stopProactiveRefresh();
    this.proactiveInterval = setInterval(() => {
      // Swallow failures here: doRefresh already calls notify(false) for the only
      // failure that matters (a reachable server rejecting us). A network failure
      // while the NAS is down must NOT log the user out mid-trip.
      this.refreshAccessToken().catch(() => {});
    }, intervalMs);
  }

  stopProactiveRefresh(): void {
    if (this.proactiveInterval) clearInterval(this.proactiveInterval);
    this.proactiveInterval = null;
  }

  /** Mobile only — call from an AppState foreground-resume listener (caller throttles). */
  async refreshOnForeground(): Promise<void> {
    // Same rationale as startProactiveRefresh: don't log out on a network failure.
    await this.refreshAccessToken().catch(() => {});
  }

  async logout(): Promise<void> {
    const base = await this.baseUrl.getBaseUrl();
    await fetch(`${base}/api/auth/logout`, { method: "POST", credentials: "include" }).catch(() => {});
    this.tokenStore.setAccessToken(null);
    await this.tokenStore.setRefreshToken(null);
    this.stopProactiveRefresh();
    this.notify(false);
  }
}
