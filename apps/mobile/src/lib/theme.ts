import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colorScheme } from "nativewind";

export const THEME_KEY = "theme";
export type Theme = "light" | "dark";

/** Theme is a local, device-only preference (no server round-trip) — mobile
 * defaults light per spec, persisted so a user's dark override survives restarts.
 * App.tsx applies the stored value at startup; this hook drives the toggle. */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(() => (colorScheme.get() === "dark" ? "dark" : "light"));

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY).then((stored) => {
      if (stored === "dark" || stored === "light") setThemeState(stored);
    });
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    colorScheme.set(t);
    void AsyncStorage.setItem(THEME_KEY, t);
  }

  return { theme, setTheme };
}
