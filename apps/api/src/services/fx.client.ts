/** open.er-api.com — free, no API key (same "free, no key" convention as the
 * weather client's Open-Meteo). Fetches one USD-based rate table and derives any
 * pair from it. The table is cached in memory and refreshed lazily once a day —
 * FX rates only move daily, and a single-user app doesn't warrant a rates table. */

const RATES_BASE = "https://open.er-api.com/v6/latest/USD";
const TTL_MS = 12 * 60 * 60 * 1000; // 12h

interface RatesResponse {
  result?: string;
  base_code?: string;
  rates?: Record<string, number>;
}

interface CachedTable {
  rates: Record<string, number>; // USD -> currency
  fetchedAt: number;
}

let cache: CachedTable | null = null;
let inFlight: Promise<CachedTable> | null = null;

async function fetchTable(): Promise<CachedTable> {
  const res = await fetch(RATES_BASE);
  if (!res.ok) throw new Error(`FX fetch failed: ${res.status}`);
  const data = (await res.json()) as RatesResponse;
  if (data.result !== "success" || !data.rates || !data.rates.USD) {
    throw new Error("FX fetch returned no usable rates");
  }
  return { rates: data.rates, fetchedAt: Date.now() };
}

async function getTable(): Promise<CachedTable> {
  if (cache && Date.now() - cache.fetchedAt < TTL_MS) return cache;
  // Dedupe concurrent refreshes so a burst of expense saves triggers one fetch.
  if (!inFlight) {
    inFlight = fetchTable()
      .then((table) => {
        cache = table;
        return table;
      })
      .finally(() => {
        inFlight = null;
      });
  }
  try {
    return await inFlight;
  } catch (err) {
    // A stale cache still beats failing outright — an estimate at yesterday's
    // rate is fine. Only hard-fail if we've never fetched successfully.
    if (cache) return cache;
    throw err;
  }
}

export class FxUnavailableError extends Error {
  constructor(public currency: string) {
    super(`No FX rate available for ${currency}`);
    this.name = "FxUnavailableError";
  }
}

/** Rate to convert 1 unit of `from` into `to` (quote-per-base — matches
 * packages/core/fx.ts `convert(amount, rate)`). Throws FxUnavailableError if
 * either currency isn't in the table. */
export async function getFxRate(from: string, to: string): Promise<number> {
  const f = from.toUpperCase();
  const t = to.toUpperCase();
  if (f === t) return 1;
  const { rates } = await getTable();
  // rates are USD -> X. from->to = (USD->to) / (USD->from).
  const usdToFrom = f === "USD" ? 1 : rates[f];
  const usdToTo = t === "USD" ? 1 : rates[t];
  if (!usdToFrom) throw new FxUnavailableError(f);
  if (!usdToTo) throw new FxUnavailableError(t);
  return usdToTo / usdToFrom;
}
