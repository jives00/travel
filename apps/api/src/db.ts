import mysql from "mysql2/promise";

let pool: mysql.Pool | null = null;

/** Lazy singleton pool. `timezone: 'Z'` is deliberate — carried forward from Quest,
 * where omitting it caused UTC timestamps to render as local time. `decimalNumbers: true`
 * is a Travel-specific addition — without it, mysql2 returns DECIMAL columns (lat/lng,
 * price, fx_rate, etc.) as strings, silently breaking every `z.number()` schema in
 * packages/types the moment a route returns a raw DB row. `dateStrings: ["DATE"]` is
 * the same category of fix for DATE columns (legs.start_date/end_date, itinerary_items.
 * scheduled_date, etc.): without it, mysql2 returns a JS Date object that serializes to a
 * full ISO datetime ("2026-09-01T00:00:00.000Z"), not the plain "YYYY-MM-DD" that
 * packages/types and packages/core's date math assume everywhere. Scoped to DATE only
 * (not DATETIME/TIMESTAMP) so created_at/updated_at are unaffected. */
export function getPool(): mysql.Pool {
  if (!pool) {
    pool = mysql.createPool({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT ?? 3306),
      database: process.env.DB_NAME ?? "travel",
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      timezone: "Z",
      decimalNumbers: true,
      dateStrings: ["DATE"],
      connectionLimit: 20,
      waitForConnections: true,
    });
  }
  return pool;
}
