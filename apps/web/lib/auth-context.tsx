"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { travelApi } from "./api";

interface AuthState {
  isAuthenticated: boolean;
  isLoading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

/** Thin wrapper around packages/api-client's framework-free AuthManager — the
 * token lifecycle itself (dedup'd refresh, proactive interval, bootstrap fallback
 * to trusted-network /session) lives there, not duplicated here. */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = travelApi.authManager.onAuthChange(setIsAuthenticated);

    travelApi.authManager.bootstrap().then((ok) => {
      setIsAuthenticated(ok);
      setIsLoading(false);
      if (ok) travelApi.authManager.startProactiveRefresh();
    });

    return () => {
      unsubscribe();
      travelApi.authManager.stopProactiveRefresh();
    };
  }, []);

  const logout = async () => {
    await travelApi.authManager.logout();
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, isLoading, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
