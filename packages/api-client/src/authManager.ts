import type { BaseUrlResolver } from "./baseUrl";
import type { TokenStore } from "./tokenStore";

/** Framework-free token lifecycle: silent refresh, dedup'd concurrent refreshes,
 * a 10-minute proactive refresh loop (safely inside the 15m JWT expiry), and a
 * foreground-resume hook for mobile. Each platform wraps this in a thin React
 * context rather than re-implementing the lifecycle. */
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
    const base = await this.baseUrl.getBaseUrl();
    const refreshToken = await this.tokenStore.getRefreshToken(); // null on web — cookie carries it
    const res = await fetch(`${base}/api/auth/refresh`, {
      method: "POST",
      credentials: "include",
      headers: refreshToken ? { "Content-Type": "application/json" } : {},
      body: refreshToken ? JSON.stringify({ refreshToken }) : undefined,
    });
    if (!res.ok) {
      this.notify(false);
      throw new Error("refresh failed");
    }
    const data = (await res.json()) as { accessToken: string };
    this.tokenStore.setAccessToken(data.accessToken);
    this.notify(true);
    return data.accessToken;
  }

  /** App-start bootstrap: try silent refresh, fall back to the passwordless
   * trusted-network /session login before giving up. */
  async bootstrap(): Promise<boolean> {
    try {
      await this.refreshAccessToken();
      return true;
    } catch {
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
      this.refreshAccessToken().catch(() => this.notify(false));
    }, intervalMs);
  }

  stopProactiveRefresh(): void {
    if (this.proactiveInterval) clearInterval(this.proactiveInterval);
    this.proactiveInterval = null;
  }

  /** Mobile only — call from an AppState foreground-resume listener (caller throttles). */
  async refreshOnForeground(): Promise<void> {
    await this.refreshAccessToken().catch(() => this.notify(false));
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
