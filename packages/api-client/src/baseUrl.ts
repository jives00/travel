/** The one genuine platform difference in base-URL resolution: web uses a relative
 * `/api` (Next.js rewrites it to the API container); mobile races a `/health` probe
 * across Tailscale + LAN base URLs (see apps/mobile/src/lib/apiBase.ts). */
export interface BaseUrlResolver {
  getBaseUrl(): Promise<string>;
  /** Force re-resolution after a runtime network failure (mobile only; web is a no-op). */
  reset(): void;
}

/** Web's resolver — always the same relative path, Next's rewrite proxy does the rest. */
export class StaticBaseUrlResolver implements BaseUrlResolver {
  constructor(private readonly baseUrl: string) {}
  async getBaseUrl(): Promise<string> {
    return this.baseUrl;
  }
  reset(): void {
    // no-op: a static base never needs re-resolution
  }
}
