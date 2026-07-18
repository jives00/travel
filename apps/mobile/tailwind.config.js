const { CATEGORY_COLORS, CHROME, STATUS_COLORS } = require("@travel/ui-tokens");

// NativeWind consumes the SAME TS token object web's tailwind.config.ts derives its
// CSS vars from (packages/ui-tokens) — one source, no second palette to drift.
// Mobile defaults light (§ spec "Color scheme"), so these map straight to the
// `.light` step rather than going through CSS custom properties like web does.
function flatten(map) {
  return Object.fromEntries(Object.entries(map).map(([key, { light, dark }]) => [key, { DEFAULT: light, dark }]));
}

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.tsx", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        category: flatten(CATEGORY_COLORS),
        surface: { DEFAULT: CHROME.surface.light, dark: CHROME.surface.dark },
        page: { DEFAULT: CHROME.page.light, dark: CHROME.page.dark },
        "text-primary": { DEFAULT: CHROME.textPrimary.light, dark: CHROME.textPrimary.dark },
        "text-secondary": { DEFAULT: CHROME.textSecondary.light, dark: CHROME.textSecondary.dark },
        "text-muted": { DEFAULT: CHROME.textMuted.light, dark: CHROME.textMuted.dark },
        gridline: { DEFAULT: CHROME.gridline.light, dark: CHROME.gridline.dark },
        status: flatten(STATUS_COLORS),
      },
    },
  },
  plugins: [],
};
