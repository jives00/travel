/** Open-Meteo — free, no API key (same provider the sibling Weather Android app
 * uses). Legs only store a city name, not coordinates, so this resolves the
 * name via Open-Meteo's own free geocoding endpoint first, then pulls a short
 * daily forecast. Condition bucketing and the low-probability precip downgrade
 * mirror the Weather app's WeatherMapper for a consistent read across apps. */

const GEOCODE_BASE = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_BASE = "https://api.open-meteo.com/v1/forecast";

/** How many consecutive days every city forecast covers, starting at that
 * city's own local today. The weather route indexes into `days` by a day's
 * offset from today, so its window must be exactly this long. */
export const FORECAST_DAYS = 4;

export interface DailyForecast {
  date: string; // "YYYY-MM-DD"
  tempMaxF: number;
  tempMinF: number;
  condition: string;
}

export interface CityForecast {
  city: string;
  days: DailyForecast[];
}

const PRECIP_CONDITIONS = new Set(["Drizzle", "Freezing Rain", "Rain", "Snow", "Rain Showers", "Snow Showers", "Thunderstorm"]);

function conditionFromWmoCode(code: number, precipProbability: number | null): string {
  let condition: string;
  if (code === 0 || code === 1) condition = "Clear";
  else if (code === 2) condition = "Partly Cloudy";
  else if (code === 3) condition = "Overcast";
  else if (code === 45 || code === 48) condition = "Fog";
  else if ([51, 53, 55].includes(code)) condition = "Drizzle";
  else if ([56, 57, 66, 67].includes(code)) condition = "Freezing Rain";
  else if ([61, 63, 65].includes(code)) condition = "Rain";
  else if ([71, 73, 75, 77].includes(code)) condition = "Snow";
  else if ([80, 81, 82].includes(code)) condition = "Rain Showers";
  else if ([85, 86].includes(code)) condition = "Snow Showers";
  else if ([95, 96, 99].includes(code)) condition = "Thunderstorm";
  else condition = "Unknown";

  // weather_code and precipitation probability can disagree — downgrade a
  // precip condition to "Partly Cloudy" when it's unlikely to actually happen.
  if (PRECIP_CONDITIONS.has(condition) && precipProbability != null && precipProbability < 15) {
    return "Partly Cloudy";
  }
  return condition;
}

interface GeocodeResult {
  // Open-Meteo returns an IANA `timezone` on every geocoding hit, so the app
  // needs no separate timezone API (and no key) to resolve a city's zone. The
  // same response carries `country` and `country_code` — that's what makes the
  // recap's country count free (migration 037).
  results?: {
    latitude: number;
    longitude: number;
    name: string;
    timezone?: string;
    country?: string;
    country_code?: string;
  }[];
}

interface ForecastResponse {
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: number[];
  };
}

/** Resolves a free-text city (or country) name to coordinates via Open-Meteo's
 * free geocoding endpoint — no API key required. Also used to lazily backfill
 * legs.lat/lng for the /map overview (see map.routes.ts) and legs.timezone for
 * calendar export (see trips.routes.ts). */
export async function geocodeCity(name: string): Promise<{
  lat: number;
  lng: number;
  name: string;
  timezone: string | null;
  country: string | null;
  countryCode: string | null;
} | null> {
  const geoRes = await fetch(`${GEOCODE_BASE}?name=${encodeURIComponent(name)}&count=1`);
  if (!geoRes.ok) return null;
  const geo = (await geoRes.json()) as GeocodeResult;
  const match = geo.results?.[0];
  if (!match) return null;
  return {
    lat: match.latitude,
    lng: match.longitude,
    name: match.name,
    timezone: match.timezone ?? null,
    country: match.country ?? null,
    countryCode: match.country_code ?? null,
  };
}

export async function getCityForecast(city: string): Promise<CityForecast | null> {
  const match = await geocodeCity(city);
  if (!match) return null;

  const params = new URLSearchParams({
    latitude: String(match.lat),
    longitude: String(match.lng),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    temperature_unit: "fahrenheit",
    timezone: "auto",
    forecast_days: String(FORECAST_DAYS),
  });
  const forecastRes = await fetch(`${FORECAST_BASE}?${params.toString()}`);
  if (!forecastRes.ok) return null;
  const data = (await forecastRes.json()) as ForecastResponse;
  if (!data.daily) return null;

  const days: DailyForecast[] = data.daily.time.map((date, i) => ({
    date,
    tempMaxF: Math.round(data.daily!.temperature_2m_max[i]),
    tempMinF: Math.round(data.daily!.temperature_2m_min[i]),
    condition: conditionFromWmoCode(data.daily!.weather_code[i], data.daily!.precipitation_probability_max[i] ?? null),
  }));

  return { city: match.name, days };
}

const ARCHIVE_BASE = "https://archive-api.open-meteo.com/v1/archive";

/** What the weather actually *was* for one city over one date range — the recap's
 * replacement for a forecast that means nothing once a trip is over. */
export interface PastWeatherSummary {
  avgHighF: number;
  avgLowF: number;
  dominantCondition: string;
  /** Days that recorded any measurable precipitation. */
  precipDays: number;
  /** Days the provider actually returned data for. */
  dayCount: number;
  /** False when the archive returned fewer days than the range asked for —
   * see migration 037: such a summary is shown but not kept. */
  isComplete: boolean;
}

interface ArchiveResponse {
  daily?: {
    time: string[];
    weather_code: (number | null)[];
    temperature_2m_max: (number | null)[];
    temperature_2m_min: (number | null)[];
    precipitation_sum: (number | null)[];
  };
}

/** Open-Meteo's ERA5 archive. Takes coordinates rather than a city name because
 * legs now store lat/lng (024) — geocoding again per leg would be a wasted call.
 *
 * Two deliberate differences from the forecast path. The archive carries **no**
 * `precipitation_probability_max` (the field comes back all-null), so the
 * condition is bucketed with a null probability — the low-probability downgrade
 * simply never fires on past data, which is right: it either rained or it
 * didn't. And a precip *day* is counted from `precipitation_sum`, the only
 * measurement the archive actually has. */
export async function getPastWeatherSummary(
  lat: number,
  lng: number,
  startDate: string,
  endDate: string,
  expectedDays: number,
): Promise<PastWeatherSummary | null> {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lng),
    start_date: startDate,
    end_date: endDate,
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum",
    temperature_unit: "fahrenheit",
    timezone: "auto",
  });
  const res = await fetch(`${ARCHIVE_BASE}?${params.toString()}`);
  if (!res.ok) return null;
  const data = (await res.json()) as ArchiveResponse;
  const daily = data.daily;
  if (!daily) return null;

  // Index by position within this one response only — never across cities. The
  // /:id/weather route got exactly this wrong once by matching days positionally
  // between different cities (fixed 2026-09-13, 07b0e5d).
  const highs: number[] = [];
  const lows: number[] = [];
  const conditions: string[] = [];
  let precipDays = 0;

  for (let i = 0; i < daily.time.length; i += 1) {
    const high = daily.temperature_2m_max[i];
    const low = daily.temperature_2m_min[i];
    // A day the archive hasn't filled in yet comes back null — skip it rather
    // than averaging a zero into the trip.
    if (high == null || low == null) continue;
    highs.push(high);
    lows.push(low);
    const code = daily.weather_code[i];
    if (code != null) conditions.push(conditionFromWmoCode(code, null));
    if ((daily.precipitation_sum[i] ?? 0) > 0) precipDays += 1;
  }

  if (highs.length === 0) return null;

  // Most frequent condition; a tie goes to whichever occurred first, so the
  // result is stable rather than dependent on object key order.
  const counts = new Map<string, number>();
  for (const c of conditions) counts.set(c, (counts.get(c) ?? 0) + 1);
  let dominantCondition = conditions[0] ?? "Unknown";
  let best = 0;
  for (const c of conditions) {
    const n = counts.get(c)!;
    if (n > best) {
      best = n;
      dominantCondition = c;
    }
  }

  const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  return {
    avgHighF: avg(highs),
    avgLowF: avg(lows),
    dominantCondition,
    precipDays,
    dayCount: highs.length,
    isComplete: highs.length >= expectedDays,
  };
}
