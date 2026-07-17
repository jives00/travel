// Singleton loader for the Google Maps JS API script, shared by every
// map-rendering component (the standalone /map page and the trip page's
// sidebar map). Two problems this avoids:
//  1. React Strict Mode (dev only) double-invokes effects on mount, so a
//     naive "if (!window.google) inject a <script>" check races itself —
//     both invocations can fire before the first script finishes loading,
//     tripping Google's "included multiple times" warning and corrupting
//     its internal state (the follow-on "p is undefined" errors).
//  2. Multiple components wanting the map (sidebar + standalone page) would
//     otherwise each inject their own script tag.
// The module-level `loadPromise` persists across renders/remounts, so every
// caller — regardless of how many times or how many components ask — shares
// exactly one script tag and one load.
let loadPromise: Promise<void> | null = null;

export function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if ((window as unknown as { google?: unknown }).google) return Promise.resolve();
  if (loadPromise) return loadPromise;

  const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY;
  if (!key) return Promise.reject(new Error("NEXT_PUBLIC_GOOGLE_MAPS_BROWSER_KEY is not set"));

  loadPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-maps-loader="true"]');
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", () => reject(new Error("Failed to load Google Maps script")));
      return;
    }
    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${key}`;
    script.async = true;
    script.dataset.googleMapsLoader = "true";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load Google Maps script"));
    document.head.appendChild(script);
  });

  return loadPromise;
}
