import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { travelApi, tokenStore } from "../lib/api";
import { prefetchPrimaryTrip } from "../lib/prefetch";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /** Re-run bootstrap. Surfaced so the boot screen can offer a retry instead of
   * leaving the user with a dead screen and a force-close. */
  retry: () => void;
}

const AuthContext = createContext<AuthState | null>(null);
const FOREGROUND_REFRESH_MIN_GAP_MS = 60_000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const lastForegroundRefresh = useRef(0);

  const retry = useCallback(() => {
    setIsLoading(true);
    setAttempt((n) => n + 1);
  }, []);

  // Subscriptions live in their own effect so a retry doesn't tear them down
  // and re-add them.
  useEffect(() => {
    const unsubscribe = travelApi.authManager.onAuthChange(setIsAuthenticated);

    // The 15m JWT can expire while the app is backgrounded — refresh on resume,
    // throttled so rapid foreground/background toggling doesn't spam /refresh.
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") return;
      const now = Date.now();
      if (now - lastForegroundRefresh.current < FOREGROUND_REFRESH_MIN_GAP_MS) return;
      lastForegroundRefresh.current = now;
      travelApi.authManager.refreshOnForeground();
      // Re-pin the primary trip on resume so a trip switched on another device,
      // or new bookings, land in the offline cache before the NAS might drop.
      void prefetchPrimaryTrip();
    });

    return () => {
      unsubscribe();
      travelApi.authManager.stopProactiveRefresh();
      sub.remove();
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    function ready(authenticated: boolean) {
      if (cancelled) return;
      setIsAuthenticated(authenticated);
      setIsLoading(false);
      if (authenticated) {
        travelApi.authManager.startProactiveRefresh();
        // Pin the primary trip so it's fully usable if the NAS drops out later.
        void prefetchPrimaryTrip();
      }
    }

    travelApi.authManager
      .bootstrap()
      .then(ready)
      // bootstrap() must never leave isLoading pinned: the navigator renders
      // nothing while it's true, so an unhandled rejection here showed a
      // permanent black screen that only a force-close cleared. Stay
      // optimistically signed in if a refresh token is still on disk (the
      // offline-first invariant), otherwise fall back to the login screen.
      .catch(async () => {
        let hasToken = false;
        try {
          hasToken = (await tokenStore.getRefreshToken()) != null;
        } catch {
          hasToken = false;
        }
        ready(hasToken);
      });

    return () => {
      cancelled = true;
    };
  }, [attempt]);

  async function login(username: string, password: string) {
    const { accessToken, refreshToken } = await travelApi.auth.login({ username, password });
    // Unlike web (refresh token is an httpOnly cookie set automatically), mobile
    // has no cookie jar — persist both tokens explicitly.
    tokenStore.setAccessToken(accessToken);
    if (refreshToken) await tokenStore.setRefreshToken(refreshToken);
    setIsAuthenticated(true);
    travelApi.authManager.startProactiveRefresh();
    void prefetchPrimaryTrip();
  }

  async function logout() {
    await travelApi.authManager.logout();
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout, retry }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
