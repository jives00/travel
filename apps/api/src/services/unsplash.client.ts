/** Unsplash API — https://unsplash.com/documentation. Used for the trip-home
 * hero photo, sourced by city name. Requires a free Unsplash Developer app
 * (unsplash.com/developers); the demo-tier Access Key is good for 50 req/hour,
 * plenty for a single-user app fetching one photo per page load. */

const BASE = "https://api.unsplash.com";

function accessKey(): string {
  const key = process.env.UNSPLASH_ACCESS_KEY;
  if (!key) throw new Error("UNSPLASH_ACCESS_KEY is not set");
  return key;
}

export interface CityPhoto {
  url: string;
  photographerName: string;
  photographerUrl: string;
}

export interface CityPhotoOption extends CityPhoto {
  // Only needed for the "pick from a grid" flow — the download endpoint gets
  // pinged when a candidate is actually selected (see selectCityPhoto), not
  // when it's merely shown as a thumbnail.
  downloadLocation: string;
}

interface SearchResult {
  urls: { raw: string };
  width: number;
  height: number;
  user: { name: string; links: { html: string } };
  links: { download_location: string };
}

interface SearchResponse {
  results?: SearchResult[];
  total_pages?: number;
}

async function searchPage(city: string, page: number): Promise<SearchResponse> {
  const res = await fetch(
    `${BASE}/search/photos?query=${encodeURIComponent(city)}&per_page=30&page=${page}&orientation=landscape`,
    { headers: { Authorization: `Client-ID ${accessKey()}` } },
  );
  if (!res.ok) return {};
  return (await res.json()) as SearchResponse;
}

/** Fresh pick on every call, drawn from a randomized page of results (not
 * always page 1) so repeat visits don't cycle through the same ~10 photos —
 * per_page is already maxed at 30, so widening the pool means reaching into
 * later pages of matches, still relevant since Unsplash sorts by relevance. */
export async function searchCityPhoto(city: string): Promise<CityPhoto | null> {
  const first = await searchPage(city, 1);
  const totalPages = Math.min(first.total_pages ?? 1, 5);
  const page = totalPages > 1 ? 1 + Math.floor(Math.random() * totalPages) : 1;
  const data = page === 1 ? first : await searchPage(city, page);

  const results = data.results ?? [];
  if (results.length === 0) return null;

  // Prefer genuinely high-resolution source photos (some contributor uploads
  // are much smaller) — fall back to the unfiltered pool only if this search
  // turned up nothing that clears the bar, rather than returning nothing.
  const highRes = results.filter((r) => r.width >= 2400);
  const pool = highRes.length > 0 ? highRes : results;
  const pick = pool[Math.floor(Math.random() * pool.length)];

  // Unsplash API Guidelines require pinging the download endpoint whenever a
  // photo is displayed in an application, not just on an explicit "download"
  // click — fire-and-forget, never blocks the response.
  fetch(pick.links.download_location, { headers: { Authorization: `Client-ID ${accessKey()}` } }).catch(() => {});

  // `urls.regular` caps out at 1080px wide, which upscales (and looks
  // pixelated) on a full-bleed hero wider than that. `urls.raw` is the
  // Imgix-backed original — request it at a real display width instead.
  return {
    url: `${pick.urls.raw}&w=2400&q=80&fit=max&auto=format`,
    photographerName: pick.user.name,
    photographerUrl: pick.user.links.html,
  };
}

/** Returns several candidates for a picker grid instead of one random pick —
 * no download-endpoint ping here, since none of these have been "used" yet
 * (that happens in selectCityPhoto, once the user actually picks one). */
export async function searchCityPhotoOptions(city: string, count = 9): Promise<CityPhotoOption[]> {
  const first = await searchPage(city, 1);
  const totalPages = Math.min(first.total_pages ?? 1, 5);
  const page = totalPages > 1 ? 1 + Math.floor(Math.random() * totalPages) : 1;
  const data = page === 1 ? first : await searchPage(city, page);

  const results = data.results ?? [];
  if (results.length === 0) return [];

  const highRes = results.filter((r) => r.width >= 2400);
  const pool = highRes.length > 0 ? highRes : results;
  const shuffled = [...pool].sort(() => Math.random() - 0.5);

  return shuffled.slice(0, count).map((r) => ({
    url: `${r.urls.raw}&w=2400&q=80&fit=max&auto=format`,
    photographerName: r.user.name,
    photographerUrl: r.user.links.html,
    downloadLocation: r.links.download_location,
  }));
}

/** Unsplash API Guidelines require pinging the download endpoint at the
 * moment a photo is actually used (here: selected from the picker grid and
 * persisted), not merely when it's shown as a search-result thumbnail. */
export async function pingCityPhotoDownload(downloadLocation: string): Promise<void> {
  await fetch(downloadLocation, { headers: { Authorization: `Client-ID ${accessKey()}` } }).catch(() => {});
}
