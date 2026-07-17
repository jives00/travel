"use client";

import { useEffect, useState } from "react";
import { travelApi } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
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
    } catch {
      setError("Invalid username or password");
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
        <input
          className="w-full rounded border border-gridline bg-transparent p-2 text-text-primary"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
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
