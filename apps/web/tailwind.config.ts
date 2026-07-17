import type { Config } from "tailwindcss";

// Semantic names -> CSS custom properties emitted by packages/ui-tokens's
// generateCssVars.ts into app/globals.css. Changing a category color there
// changes it here automatically — one source, never two palettes to keep in sync.
const rgbVar = (name: string) => `rgb(var(--${name}-rgb) / <alpha-value>)`;

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        category: {
          transit: rgbVar("category-transit"),
          activity: rgbVar("category-activity"),
          shopping: rgbVar("category-shopping"),
          sight: rgbVar("category-sight"),
          lodging: rgbVar("category-lodging"),
          food: rgbVar("category-food"),
          other: rgbVar("category-other"),
        },
        surface: rgbVar("chrome-surface"),
        page: rgbVar("chrome-page"),
        "text-primary": rgbVar("chrome-text-primary"),
        "text-secondary": rgbVar("chrome-text-secondary"),
        "text-muted": rgbVar("chrome-text-muted"),
        gridline: rgbVar("chrome-gridline"),
        baseline: rgbVar("chrome-baseline"),
        status: {
          good: rgbVar("status-good"),
          warning: rgbVar("status-warning"),
          serious: rgbVar("status-serious"),
          critical: rgbVar("status-critical"),
        },
      },
    },
  },
  plugins: [],
};

export default config;
