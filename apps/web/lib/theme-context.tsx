"use client";

import { createContext, useContext, useEffect, useState } from "react";

type Theme = "light" | "dark";
const THEME_KEY = "theme";

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("dark");

  useEffect(() => {
    // Belt-and-suspenders with the inline FOUC script in layout.tsx — re-read on mount.
    const attr = document.documentElement.getAttribute("data-theme");
    if (attr === "light" || attr === "dark") setThemeState(attr);
  }, []);

  const setTheme = (t: Theme) => {
    setThemeState(t);
    localStorage.setItem(THEME_KEY, t);
    document.documentElement.setAttribute("data-theme", t);
  };

  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeState {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
