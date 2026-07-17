/** Open-Meteo — free, no API key (same provider the sibling Weather Android app
 * uses). Legs only store a city name, not coordinates, so this resolves the
 * name via Open-Meteo's own free geocoding endpoint first, then pulls a short
 * daily forecast. Condition bucketing and the low-probability precip downgrade
 * mirror the Weather app's WeatherMapper for a consistent read across apps. */

const GEOCODE_BASE = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST_BASE = "https://api.open-meteo.com/v1/forecast";

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
  results?: { latitude: number; longitude: number; name: string }[];
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
 * legs.lat/lng for the /map overview (see map.routes.ts). */
export async function geocodeCity(name: string): Promise<{ lat: number; lng: number; name: string } | null> {
  const geoRes = await fetch(`${GEOCODE_BASE}?name=${encodeURIComponent(name)}&count=1`);
  if (!geoRes.ok) return null;
  const geo = (await geoRes.json()) as GeocodeResult;
  const match = geo.results?.[0];
  if (!match) return null;
  return { lat: match.latitude, lng: match.longitude, name: match.name };
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
    forecast_days: "4",
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
