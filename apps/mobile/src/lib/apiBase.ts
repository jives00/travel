import type { BaseUrlResolver } from "@travel/api-client";
import { API_BASES } from "./constants";

/** Copied from Quest's src/lib/apiBase.ts — races a /health probe (2.5s timeout)
 * across every base, caches the first success, re-probes on demand after a
 * runtime failure. Implements packages/api-client's BaseUrlResolver interface so
 * the shared client can use it without knowing this probing logic exists. */

function probe(base: string, timeoutMs = 2500): Promise<string | null> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(`${base}/health`, { signal: controller.signal })
    .then((res) => (res.ok ? base : null))
    .catch(() => null)
    .finally(() => clearTimeout(timeout));
}

export class ProbingBaseUrlResolver implements BaseUrlResolver {
  private resolved: string | null = null;
  private pending: Promise<string> | null = null;

  async getBaseUrl(): Promise<string> {
    if (this.resolved) return this.resolved;
    if (!this.pending) this.pending = this.resolveNow();
    return this.pending;
  }

  private async resolveNow(): Promise<string> {
    return new Promise((resolve, reject) => {
      let remaining = API_BASES.length;
      for (const base of API_BASES) {
        probe(base).then((result) => {
          remaining -= 1;
          if (result && !this.resolved) {
            this.resolved = result;
            resolve(result);
          } else if (remaining === 0 && !this.resolved) {
            reject(new Error("no reachable API base"));
          }
        });
      }
    });
  }

  /** Force re-probe after a runtime network failure. */
  reset(): void {
    this.resolved = null;
    this.pending = null;
  }
}
