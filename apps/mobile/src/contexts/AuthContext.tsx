import { createContext, useContext, useEffect, useRef, useState } from "react";
import { AppState, type AppStateStatus } from "react-native";
import { travelApi, tokenStore } from "../lib/api";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);
const FOREGROUND_REFRESH_MIN_GAP_MS = 60_000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const lastForegroundRefresh = useRef(0);

  useEffect(() => {
    const unsubscribe = travelApi.authManager.onAuthChange(setIsAuthenticated);

    travelApi.authManager.bootstrap().then((ok) => {
      setIsAuthenticated(ok);
      setIsLoading(false);
      if (ok) travelApi.authManager.startProactiveRefresh();
    });

    // The 15m JWT can expire while the app is backgrounded — refresh on resume,
    // throttled so rapid foreground/background toggling doesn't spam /refresh.
    const sub = AppState.addEventListener("change", (state: AppStateStatus) => {
      if (state !== "active") return;
      const now = Date.now();
      if (now - lastForegroundRefresh.current < FOREGROUND_REFRESH_MIN_GAP_MS) return;
      lastForegroundRefresh.current = now;
      travelApi.authManager.refreshOnForeground();
    });

    return () => {
      unsubscribe();
      travelApi.authManager.stopProactiveRefresh();
      sub.remove();
    };
  }, []);

  async function login(username: string, password: string) {
    const { accessToken, refreshToken } = await travelApi.auth.login({ username, password });
    // Unlike web (refresh token is an httpOnly cookie set automatically), mobile
    // has no cookie jar — persist both tokens explicitly.
    tokenStore.setAccessToken(accessToken);
    if (refreshToken) await tokenStore.setRefreshToken(refreshToken);
    setIsAuthenticated(true);
    travelApi.authManager.startProactiveRefresh();
  }

  async function logout() {
    await travelApi.authManager.logout();
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
