import { getPool } from "../db";
import { geocodeCity } from "./weather.client";

/** Everything a leg derives from its city name, filled lazily from one lookup.
 *
 * There were two of these — `backfillLegTimezones` in trips.routes.ts and an
 * inline lat/lng fill in map.routes.ts — each geocoding the same city for a
 * different column. Migration 037 would have made it three (country), so they
 * collapse here instead: one geocode per unbackfilled leg, every column it can
 * answer written at once.
 *
 * Self-healing cache, not a migration step: a leg is filled the first time
 * something reads it, a failed lookup leaves the columns null and is retried on
 * the next read, and once set this is a no-op. Lookups run in parallel so a trip
 * with cold legs costs one round trip, once.
 */
export interface LegGeoRow {
  id: number;
  city: string;
  timezone?: string | null;
  lat?: number | null;
  lng?: number | null;
  country?: string | null;
  countryCode?: string | null;
}

export async function backfillLegGeo(legs: LegGeoRow[]): Promise<void> {
  const missing = legs.filter(
    (leg) =>
      leg.timezone == null ||
      leg.lat == null ||
      leg.lng == null ||
      leg.country == null ||
      leg.countryCode == null,
  );
  if (missing.length === 0) return;

  await Promise.all(
    missing.map(async (leg) => {
      const geo = await geocodeCity(leg.city).catch(() => null);
      if (!geo) return;

      // Only write what's actually missing and actually answered — a provider
      // that stops returning a country must not blank one already stored.
      const updates: { column: string; value: unknown; apply: () => void }[] = [];
      if (leg.timezone == null && geo.timezone != null)
        updates.push({ column: "timezone", value: geo.timezone, apply: () => (leg.timezone = geo.timezone) });
      if (leg.lat == null) updates.push({ column: "lat", value: geo.lat, apply: () => (leg.lat = geo.lat) });
      if (leg.lng == null) updates.push({ column: "lng", value: geo.lng, apply: () => (leg.lng = geo.lng) });
      if (leg.country == null && geo.country != null)
        updates.push({ column: "country", value: geo.country, apply: () => (leg.country = geo.country) });
      if (leg.countryCode == null && geo.countryCode != null)
        updates.push({
          column: "country_code",
          value: geo.countryCode,
          apply: () => (leg.countryCode = geo.countryCode),
        });

      if (updates.length === 0) return;
      for (const u of updates) u.apply();
      await getPool().query(
        `UPDATE legs SET ${updates.map((u) => `${u.column} = ?`).join(", ")} WHERE id = ?`,
        [...updates.map((u) => u.value), leg.id],
      );
    }),
  );
}
