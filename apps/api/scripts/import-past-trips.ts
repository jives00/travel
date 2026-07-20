import fs from "node:fs";
import path from "node:path";
import { config } from "dotenv";
config({ path: path.join(__dirname, "../../../.env") });

import { getPool } from "../src/db";
import { findUserByUsername } from "../src/services/auth.service";
import { geocodeCity } from "../src/services/weather.client";

// Fill in apps/api/scripts/data/legs.csv (trip_name, city, start_date, end_date)
// and apps/api/scripts/data/day_trips.csv (trip_name, day_trip_name, lat, lng —
// lat/lng optional, geocoded from the name if left blank), then run:
//   pnpm --filter @travel/api run import-past-trips
//
// Dates can be "YYYY-MM-DD" or Excel's default "M/D/YYYY" — both are
// normalized below. Everything is validated (parseable dates, start <= end,
// no implausible multi-year leg) BEFORE anything is written to the database,
// so a bad row aborts the whole run with nothing partially created — no more
// deleting orphaned trips by hand after a mid-run crash.

interface LegInput {
  city: string;
  startDate: string;
  endDate: string;
}

interface DayTripInput {
  name: string;
  lat?: number;
  lng?: number;
}

interface TripInput {
  name: string;
  legs: LegInput[];
  dayTrips: DayTripInput[];
}

const DATA_DIR = path.join(__dirname, "data");

// Minimal RFC4180 parser (quoted fields, embedded commas/quotes) — not worth a
// dependency for a one-time script.
function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && content[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((f) => f.trim() !== "")) rows.push(row);
      row = [];
    } else field += c;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    if (row.some((f) => f.trim() !== "")) rows.push(row);
  }
  return rows;
}

function readCsv(fileName: string): Record<string, string>[] {
  const filePath = path.join(DATA_DIR, fileName);
  if (!fs.existsSync(filePath)) return [];
  const [header, ...body] = parseCsv(fs.readFileSync(filePath, "utf-8"));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] ?? "").trim()])));
}

// Accepts "YYYY-MM-DD" as-is, or Excel's default "M/D/YYYY" / "MM/DD/YYYY"
// (US locale — matches ADMIN_USERNAME's locale, not a general-purpose parser).
function normalizeDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const m = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!m) return null;
  const [, month, day, year] = m;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

interface LoadResult {
  trips: TripInput[];
  errors: string[];
}

function loadTrips(): LoadResult {
  const tripsByName = new Map<string, TripInput>();
  const errors: string[] = [];
  function trip(name: string): TripInput {
    if (!tripsByName.has(name)) tripsByName.set(name, { name, legs: [], dayTrips: [] });
    return tripsByName.get(name)!;
  }

  for (const row of readCsv("legs.csv")) {
    const startDate = normalizeDate(row.start_date);
    const endDate = normalizeDate(row.end_date);
    const label = `${row.trip_name} / ${row.city}`;
    if (!startDate) errors.push(`${label}: unrecognized start_date "${row.start_date}" (expected YYYY-MM-DD or M/D/YYYY)`);
    if (!endDate) errors.push(`${label}: unrecognized end_date "${row.end_date}" (expected YYYY-MM-DD or M/D/YYYY)`);
    if (!startDate || !endDate) continue;
    if (startDate > endDate) {
      errors.push(`${label}: start date ${startDate} is after end date ${endDate}`);
      continue;
    }
    const days = (Date.parse(endDate) - Date.parse(startDate)) / 86_400_000;
    if (days > 60) {
      errors.push(`${label}: spans ${Math.round(days)} days (${startDate} to ${endDate}) — likely a typo`);
      continue;
    }
    trip(row.trip_name).legs.push({ city: row.city, startDate, endDate });
  }
  for (const row of readCsv("day_trips.csv")) {
    trip(row.trip_name).dayTrips.push({
      name: row.day_trip_name,
      lat: row.lat ? Number(row.lat) : undefined,
      lng: row.lng ? Number(row.lng) : undefined,
    });
  }
  return { trips: [...tripsByName.values()], errors };
}

async function main() {
  // Pure CSV parsing/validation — no DB connection needed, so `--check` can
  // validate the CSVs on their own before you're ready to actually import.
  const { trips, errors } = loadTrips();
  if (errors.length > 0) {
    console.error(`Found ${errors.length} problem(s) in the CSVs — fix these and re-run. Nothing was imported:`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  if (trips.length === 0) {
    console.log("No rows found in apps/api/scripts/data/legs.csv — nothing to import.");
    return;
  }

  if (process.argv.includes("--check")) {
    for (const trip of trips) {
      console.log(`${trip.name}: ${trip.legs.map((l) => l.city).join(" -> ")}${trip.dayTrips.length ? ` (day trips: ${trip.dayTrips.map((d) => d.name).join(", ")})` : ""}`);
    }
    console.log(`\n${trips.length} trip(s) look valid. Re-run without --check to actually import.`);
    return;
  }

  const username = process.env.ADMIN_USERNAME;
  if (!username) throw new Error("ADMIN_USERNAME is not set in .env");
  const user = await findUserByUsername(username);
  if (!user) throw new Error(`No user "${username}" found — has the API run at least once to create it?`);

  for (const trip of trips) {
    const [tripResult] = await getPool().query("INSERT INTO trips (user_id, name) VALUES (?, ?)", [
      user.id,
      trip.name,
    ]);
    const tripId = (tripResult as { insertId: number }).insertId;
    console.log(`Trip "${trip.name}" -> id ${tripId}`);

    for (const [i, leg] of trip.legs.entries()) {
      const geo = await geocodeCity(leg.city).catch(() => null);
      await getPool().query(
        "INSERT INTO legs (trip_id, sort_order, city, start_date, end_date, lat, lng) VALUES (?, ?, ?, ?, ?, ?, ?)",
        [tripId, i, leg.city, leg.startDate, leg.endDate, geo?.lat ?? null, geo?.lng ?? null],
      );
      console.log(`  leg: ${leg.city} (${leg.startDate} to ${leg.endDate})${geo ? "" : " [could not geocode yet — /map will retry]"}`);
    }

    for (const dayTrip of trip.dayTrips) {
      let { lat, lng } = dayTrip;
      if (lat == null || lng == null) {
        const geo = await geocodeCity(dayTrip.name).catch(() => null);
        if (!geo) {
          console.warn(`  ! could not geocode day trip "${dayTrip.name}" — skipped. Add lat/lng in day_trips.csv and re-run.`);
          continue;
        }
        lat = geo.lat;
        lng = geo.lng;
      }
      const [placeResult] = await getPool().query(
        `INSERT INTO places (user_id, name, primary_tag, status, lat, lng, location)
         VALUES (?, ?, 'day_trip', 'planned', ?, ?, ST_SRID(POINT(?, ?), 0))`,
        [user.id, dayTrip.name, lat, lng, lng, lat],
      );
      const placeId = (placeResult as { insertId: number }).insertId;
      await getPool().query("INSERT INTO trip_places (trip_id, place_id) VALUES (?, ?)", [tripId, placeId]);
      // The trip page's itinerary view only renders places that also have an
      // itinerary_items row (even an unscheduled one, leg_id/scheduled_date
      // both NULL) — trip_places alone (the ideas-tray link above) makes it
      // show on the Places page and the map, but not on the trip page itself.
      // This is the same pair of writes the "Add place" UI does in one step.
      await getPool().query(
        "INSERT INTO itinerary_items (trip_id, item_type, place_id) VALUES (?, 'place', ?)",
        [tripId, placeId],
      );
      console.log(`  day trip: ${dayTrip.name}`);
    }
  }

  console.log(`Done — imported ${trips.length} trip(s).`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
