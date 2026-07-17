import type { ThemedColor } from "./categories";

/** Neutral warm-gray/near-black chrome — deliberately not colored, so the 7
 * category hues are the only saturated colors competing for attention anywhere. */
export const CHROME: Record<string, ThemedColor> = {
  surface: { light: "#fcfcfb", dark: "#1a1a19" },
  page: { light: "#f9f9f7", dark: "#0d0d0d" },
  textPrimary: { light: "#0b0b0b", dark: "#ffffff" },
  textSecondary: { light: "#52514e", dark: "#c3c2b7" },
  textMuted: { light: "#898781", dark: "#898781" },
  gridline: { light: "#e1e0d9", dark: "#2c2c2a" },
  baseline: { light: "#c3c2b7", dark: "#383835" },
};

/** Status colors — reserved, never reused for a category. */
export const STATUS_COLORS: Record<"good" | "warning" | "serious" | "critical", ThemedColor> = {
  good: { light: "#0ca30c", dark: "#0ca30c" },
  warning: { light: "#fab219", dark: "#fab219" },
  serious: { light: "#ec835a", dark: "#ec835a" },
  critical: { light: "#d03b3b", dark: "#d03b3b" },
};
