import type { Metadata } from "next";
import { Providers } from "@/lib/providers";
import "./globals.css";

export const metadata: Metadata = { title: "Travel" };

// Web defaults to dark (planning at a desk); mobile defaults to light (outdoor
// readability) — see plans/travel-feature-spec.md "Color scheme". This constant
// is the platform-specific default the FOUC-prevention script below falls back to.
const PLATFORM_DEFAULT_THEME = "dark";

const themeScript = `
(function() {
  try {
    var stored = localStorage.getItem('theme');
    var theme = stored === 'light' || stored === 'dark' ? stored : '${PLATFORM_DEFAULT_THEME}';
    document.documentElement.setAttribute('data-theme', theme);
  } catch (e) {}
})();
`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // The inline script below sets data-theme on this element before React
    // hydrates, on purpose (FOUC prevention) — the mismatch is expected and safe,
    // not a real bug, so React shouldn't warn about (or try to "fix") it.
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Material Symbols — ligature-based icon font, referenced by name
            (e.g. "church", "beach_access") from packages/core's EnumEntry.iconName. */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined&display=block" />
        {/* eslint-disable-next-line @next/next/no-sync-scripts */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
