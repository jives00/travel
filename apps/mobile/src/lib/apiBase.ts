import type { BaseUrlResolver } from "@travel/api-client";
import { API_BASES } from "./constants";

/** Copied from Quest's src/lib/apiBase.ts — races a /health probe (2.5s timeout)
 * across every base, caches the first success, re-probes on demand after a
 * runtime failure. Implements packages/api-client's BaseUrlResolver interface so
 * the shared client can use it without knowing this probing logic exists. */

const PROBE_TIMEOUT_MS = 2500;

/**
 * Resolves `null` after `ms`. This is the half of probe()'s race that is
 * guaranteed to settle.
 *
 * An AbortController alone is NOT enough: a `fetch` whose connection is
 * established but whose response never arrives — a network transition mid-flight
 * (wifi handover, Tailscale coming up) orphaning the request underneath — can
 * ignore the abort and leave its promise pending forever. That wedged the whole
 * app: `resolveNow` only settles from inside a probe callback, so getBaseUrl()
 * never resolved, so AuthManager.bootstrap() never settled, so the auth context
 * kept isLoading=true and the navigator rendered nothing — a black screen that
 * only a force-close cleared, with no error logged anywhere. Racing against a
 * timer makes "no answer" a value instead of a hang.
 */
function timeoutAfter(ms: number): { promise: Promise<null>; cancel: () => void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const promise = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), ms);
  });
  return { promise, cancel: () => clearTimeout(timer) };
}

/** Never rejects and never hangs: resolves the base on a healthy /health, else null. */
function probe(base: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<string | null> {
  const controller = new AbortController();
  const timeout = timeoutAfter(timeoutMs);
  const request = fetch(`${base}/health`, { signal: controller.signal })
    .then((res) => (res.ok ? base : null))
    .catch(() => null);

  return Promise.race([request, timeout.promise]).finally(() => {
    timeout.cancel();
    // Best-effort cleanup of a request the race abandoned. Harmless once the
    // fetch has already settled, and the reason we can't rely on it alone is
    // exactly that it sometimes fails to land.
    controller.abort();
  });
}

export class ProbingBaseUrlResolver implements BaseUrlResolver {
  private resolved: string | null = null;
  private pending: Promise<string> | null = null;

  async getBaseUrl(): Promise<string> {
    if (this.resolved) return this.resolved;
    if (!this.pending) {
      // Drop the memo if the round fails. Caching a *rejected* promise would
      // hand the same rejection to every later call, so one bad probe round
      // (e.g. a few seconds with no network at startup) would keep the API
      // unreachable until the process restarted, even once the NAS was back.
      this.pending = this.resolveNow().catch((err: unknown) => {
        this.pending = null;
        throw err;
      });
    }
    return this.pending;
  }

  private resolveNow(): Promise<string> {
    // Guard the degenerate case: with no bases the loop below would never run
    // and the promise would never settle — the same hang as above.
    if (API_BASES.length === 0) {
      return Promise.reject(new Error("no API bases configured"));
    }
    return new Promise<string>((resolve, reject) => {
      let remaining = API_BASES.length;
      let settled = false;
      for (const base of API_BASES) {
        // probe() always settles, so `remaining` always reaches 0 and this
        // promise always resolves or rejects.
        void probe(base).then((result) => {
          remaining -= 1;
          if (settled) return;
          if (result) {
            settled = true;
            this.resolved = result;
            resolve(result);
          } else if (remaining === 0) {
            settled = true;
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

  /** Is any API base reachable *right now*? Used by the connectivity manager to
   * detect the "NAS down while the phone still has internet" case (device is
   * online per NetInfo, but home is unreachable) and to notice recovery. Always
   * probes fresh (ignores the cached base) and resolves — never rejects — so it's
   * safe to poll. On success, adopts the reachable base as the cached one.
   *
   * Depends on probe() always settling: this awaits every probe, and the
   * connectivity manager holds a `checking` latch across the await, so a single
   * pending probe would silently disable reachability polling for good. */
  async isReachable(): Promise<boolean> {
    const results = await Promise.all(API_BASES.map((base) => probe(base)));
    const reachable = results.find((r): r is string => r != null);
    if (reachable) {
      this.resolved = reachable;
      this.pending = null;
      return true;
    }
    return false;
  }
}
