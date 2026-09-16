"use client";

import { useEffect, useState } from "react";
import { describeLoginError } from "@travel/api-client";
import { travelApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // On a trusted network (home Wi-Fi/Tailscale), AuthProvider's bootstrap() call
  // silently logs in via the passwordless /api/auth/session flow — this page
  // would otherwise sit there authenticated with no way off the login form.
  useEffect(() => {
    if (isAuthenticated) window.location.href = "/travel";
  }, [isAuthenticated]);

  // Don't show a submittable form while bootstrap() is still resolving — typing
  // and submitting during that window hits the real manual-login endpoint with
  // whatever was typed, which correctly (but confusingly) rejects it, instead of
  // just waiting the extra moment for the trusted-network check to redirect away.
  if (isLoading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-page">
        <p className="text-text-secondary">Checking network…</p>
      </main>
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await travelApi.auth.login({ username, password });
      // The response already set the httpOnly refresh cookie. A full navigation
      // (not client-side router.push) re-mounts AuthProvider, whose bootstrap()
      // picks the cookie up via a fresh /api/auth/refresh call.
      // "/" 404s — the app's basePath is "/travel" (next.config.mjs), and a raw
      // window.location.href bypasses Next's basePath-aware routing entirely
      // (unlike <Link>/router.push, which prepend it automatically).
      window.location.href = "/travel";
    } catch (err) {
      // Never blame the password for a failure that never reached the password
      // check — describeLoginError separates unreachable/429/5xx from a real 401.
      setError(describeLoginError(err).message);
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-page">
      <form onSubmit={onSubmit} className="w-full max-w-sm space-y-4 rounded-lg bg-surface p-6">
        <h1 className="text-lg font-semibold text-text-primary">Sign in to Travel</h1>
        <input
          className="w-full rounded border border-gridline bg-transparent p-2 text-text-primary"
          placeholder="Username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />
        <div className="relative">
          <input
            className="w-full rounded border border-gridline bg-transparent p-2 pr-10 text-text-primary"
            placeholder="Password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            title={showPassword ? "Hide password" : "Show password"}
            className="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-text-secondary hover:text-text-primary"
          >
            <EyeIcon off={showPassword} />
          </button>
        </div>
        {error && <p className="text-sm text-status-critical">{error}</p>}
        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-category-transit p-2 font-medium text-white disabled:opacity-50"
        >
          {submitting ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </main>
  );
}

/** Inline rather than from an icon package: the web app has no icon dependency,
 * and this is the only icon on the login screen. `off` draws the struck-through
 * variant shown while the password is visible. */
function EyeIcon({ off }: { off: boolean }) {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1.5 12S5.2 5.5 12 5.5 22.5 12 22.5 12 18.8 18.5 12 18.5 1.5 12 1.5 12Z" />
      <circle cx="12" cy="12" r="3.2" />
      {off && <line x1="3.5" y1="20.5" x2="20.5" y2="3.5" />}
    </svg>
  );
}
