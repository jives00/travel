import { ApiError } from "./client";

/** Why a sign-in attempt failed. `credentials` is the only kind that means the
 * password was actually wrong — every other kind is a reason to wait and retry,
 * which is exactly the distinction the login screens used to throw away. */
export type LoginFailureKind = "credentials" | "rateLimited" | "unreachable" | "server" | "badRequest" | "unknown";

export interface LoginFailure {
  kind: LoginFailureKind;
  /** User-facing copy. Says plainly whether the password is implicated. */
  message: string;
  /** True when trying the same credentials again later can succeed. */
  retryable: boolean;
}

/** Recognises "we never got an answer" across both platforms. RN's fetch rejects
 * with TypeError("Network request failed"), the browser's with
 * TypeError("Failed to fetch"), the client's 12s budget with an AbortError, and
 * mobile's base-URL probe with "no reachable API base" when the NAS is down or
 * Tailscale isn't up. None of those touched the password. */
function isUnreachable(err: unknown): boolean {
  if (err instanceof ApiError) return false;
  const name = err instanceof Error ? err.name : "";
  if (name === "AbortError" || name === "TimeoutError") return true;
  const message = err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  return (
    message.includes("no reachable api base") ||
    message.includes("no api bases configured") ||
    message.includes("network request failed") ||
    message.includes("failed to fetch") ||
    message.includes("networkerror") ||
    message.includes("aborted")
  );
}

/** @fastify/rate-limit answers 429 with `{"message":"Rate limit exceeded, retry in 12 minutes"}`.
 * Lift that tail out so the screen can say how long to wait instead of guessing. */
function retryHint(body: string): string | null {
  const match = /retry in ([^".}]+)/i.exec(body);
  return match ? match[1].trim() : null;
}

/**
 * Turn whatever `auth.login()` threw into copy that names the real cause.
 *
 * Both login screens used to `catch { setError("Invalid username or password") }`,
 * so an unreachable NAS and a 429 from /login's 10-per-15-minutes limiter both
 * accused the password — and since retrying burns limiter budget, a network
 * blip could *become* a 429 that still read as a typo, with no way to tell the
 * difference from the screen.
 */
export function describeLoginError(err: unknown): LoginFailure {
  if (isUnreachable(err)) {
    return {
      kind: "unreachable",
      message:
        "Can't reach the Travel server — your password wasn't checked. Confirm Tailscale is connected (or you're on home Wi-Fi), then try again in a minute.",
      retryable: true,
    };
  }

  if (err instanceof ApiError) {
    if (err.status === 401 || err.status === 403) {
      return { kind: "credentials", message: "Incorrect username or password.", retryable: false };
    }
    if (err.status === 429) {
      const hint = retryHint(err.message);
      return {
        kind: "rateLimited",
        message: `Too many sign-in attempts — the server is blocking further tries${
          hint ? ` for another ${hint}` : " for up to 15 minutes"
        }. This is not a password problem; wait it out and try again.`,
        retryable: true,
      };
    }
    if (err.status === 400) {
      return { kind: "badRequest", message: "Enter both a username and a password.", retryable: false };
    }
    if (err.status >= 500) {
      return {
        kind: "server",
        message: `The server answered with an error (${err.status}) — your password wasn't checked. Try again in a minute.`,
        retryable: true,
      };
    }
    return {
      kind: "unknown",
      message: `Sign-in failed (${err.status}). ${err.message || "No detail from the server."}`,
      retryable: true,
    };
  }

  return {
    kind: "unknown",
    message: `Sign-in failed: ${err instanceof Error ? err.message : String(err)}`,
    retryable: true,
  };
}
