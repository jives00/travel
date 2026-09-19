/** One-off repair: re-stamp `itinerary_items.completed_at` in the trip's timezone.
 *
 * Until the `todayInTripZone` fix, checking an entry off stamped today's date in
 * the *device's* zone. On a laptop still set to US time in Seville, 8am Saturday
 * is Friday night at home, so a morning's worth of checkboxes was recorded
 * against the previous day — and `completed_at` is a bare DATE, so the wrong day
 * is wrong forever. This finds those rows and rewrites them.
 *
 * The evidence is `updated_at`: it is `ON UPDATE NOW()`, so for a row whose last
 * write *was* the check-off it is the exact instant the box was ticked. Read that
 * instant in the leg's zone and you get the day it actually happened.
 *
 * That is also this script's one real limitation: an item checked off on Friday
 * and then edited again on Saturday carries Saturday's `updated_at`, and nothing
 * in the row distinguishes the two. Two guards keep that contained, and neither
 * is a substitute for reading the dry run:
 *
 *   1. A row is only touched when the stored date is exactly one day off the
 *      computed one. A larger gap means the row was edited later, not mis-zoned.
 *   2. A row is only touched when the stored date is what the *home* zone would
 *      have produced at that instant — the actual signature of the bug. A row
 *      that was already right in both zones is left alone.
 *
 * Prints what it would do and changes nothing unless run with `--apply`:
 *
 *   pnpm --filter @travel/api exec tsx scripts/fix-completed-at-zone.ts
 *   pnpm --filter @travel/api exec tsx scripts/fix-completed-at-zone.ts --apply
 *
 * `--trip <id>` narrows it to one trip.
 */
import path from "node:path";
import { config } from "dotenv";
config({ path: path.join(__dirname, "../../../.env") });

import { resolveTimezone, todayInZone, type TimezoneSource } from "@travel/core";
import { getPool } from "../src/db";

const apply = process.argv.includes("--apply");
const tripArg = process.argv.indexOf("--trip");
const onlyTrip = tripArg !== -1 ? Number(process.argv[tripArg + 1]) : null;

interface LegRow {
  id: number;
  tripId: number;
  city: string;
  timezone: string | null;
  startDate: string | null;
  endDate: string | null;
}

interface ItemRow {
  id: number;
  tripId: number;
  legId: number | null;
  userId: number;
  tripTitle: string;
  label: string | null;
  completedAt: string; // DATE, so mysql2 hands back "YYYY-MM-DD" (see db.ts)
  updatedAt: Date | null;
}

function dayShift(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

async function main() {
  const pool = getPool();

  // `updated_at` is written by MySQL's NOW(), which is the *server's* clock, and
  // db.ts tells mysql2 to read every DATETIME back as UTC. If those two disagree
  // the timestamps are being misread by exactly the server's offset, and every
  // date computed below would be off — so refuse rather than write garbage.
  const [[clock]] = (await pool.query("SELECT NOW() AS now, UTC_TIMESTAMP() AS utc")) as [
    { now: Date; utc: Date }[],
    unknown,
  ];
  const skewMinutes = Math.abs(clock.now.getTime() - clock.utc.getTime()) / 60_000;
  if (skewMinutes > 1) {
    throw new Error(
      `MySQL is not on UTC (NOW() and UTC_TIMESTAMP() differ by ${Math.round(skewMinutes)} minutes). ` +
        `updated_at cannot be read as UTC, so this script would compute the wrong dates.`,
    );
  }

  const [legRows] = (await pool.query(
    `SELECT id, trip_id AS tripId, city, timezone,
            start_date AS startDate, end_date AS endDate
     FROM legs`,
  )) as [LegRow[], unknown];
  const legsByTrip = new Map<number, LegRow[]>();
  for (const leg of legRows) legsByTrip.set(leg.tripId, [...(legsByTrip.get(leg.tripId) ?? []), leg]);

  const [settingRows] = (await pool.query(
    "SELECT user_id AS userId, home_timezone AS homeTimezone FROM settings",
  )) as [{ userId: number; homeTimezone: string | null }[], unknown];
  const homeByUser = new Map(settingRows.map((s) => [s.userId, s.homeTimezone]));

  const [items] = (await pool.query(
    `SELECT i.id, i.trip_id AS tripId, i.leg_id AS legId, t.user_id AS userId,
            t.name AS tripTitle, COALESCE(p.name, i.activity_text) AS label,
            i.completed_at AS completedAt, i.updated_at AS updatedAt
     FROM itinerary_items i
     JOIN trips t ON t.id = i.trip_id
     LEFT JOIN places p ON p.id = i.place_id
     WHERE i.completed = 1 AND i.completed_at IS NOT NULL
       ${onlyTrip != null ? "AND i.trip_id = ?" : ""}
     ORDER BY i.trip_id, i.completed_at, i.id`,
    onlyTrip != null ? [onlyTrip] : [],
  )) as [ItemRow[], unknown];

  const fixes: { item: ItemRow; from: string; to: string; zone: string }[] = [];
  const skipped: { item: ItemRow; why: string }[] = [];

  for (const item of items) {
    if (!item.updatedAt) {
      skipped.push({ item, why: "no updated_at to date it by" });
      continue;
    }
    const home = homeByUser.get(item.userId) ?? null;
    const source: TimezoneSource = { legs: legsByTrip.get(item.tripId) ?? [], homeTimezone: home };
    // The leg wins; failing that the stored date picks the leg it falls inside —
    // the same resolution order the app itself uses.
    const zone = resolveTimezone(source, { legId: item.legId, date: item.completedAt });
    if (!zone) {
      skipped.push({ item, why: "no timezone on its leg, and no home timezone set" });
      continue;
    }
    const correct = todayInZone(zone, item.updatedAt);
    if (correct === item.completedAt) continue;

    const shift = dayShift(item.completedAt, correct);
    if (Math.abs(shift) !== 1) {
      skipped.push({ item, why: `computed ${correct} is ${shift} days off — edited after check-off?` });
      continue;
    }
    if (!home) {
      skipped.push({ item, why: "no home timezone, so the mis-stamp can't be confirmed" });
      continue;
    }
    if (todayInZone(home, item.updatedAt) !== item.completedAt) {
      skipped.push({ item, why: `stored ${item.completedAt} isn't what ${home} would have stamped` });
      continue;
    }
    fixes.push({ item, from: item.completedAt, to: correct, zone });
  }

  console.log(`${items.length} completed item(s) with a date${onlyTrip != null ? ` on trip ${onlyTrip}` : ""}.`);
  for (const { item, from, to, zone } of fixes) {
    console.log(
      `  #${item.id} ${item.tripTitle} · ${item.label ?? "(untitled)"}: ${from} → ${to}  ` +
        `(ticked ${item.updatedAt!.toISOString()}, ${zone})`,
    );
  }
  for (const { item, why } of skipped) {
    console.log(`  - #${item.id} ${item.label ?? "(untitled)"} left alone: ${why}`);
  }

  if (fixes.length === 0) {
    console.log("Nothing to change.");
  } else if (!apply) {
    console.log(`\n${fixes.length} row(s) would change. Re-run with --apply to write them.`);
  } else {
    // One statement per row, in a transaction: the set is small and each row has
    // its own value, so there is nothing to gain from batching and a half-applied
    // repair is worse than none.
    //
    // `updated_at = updated_at` is load-bearing, not a no-op. The column is
    // `ON UPDATE NOW()`, and an explicit assignment is the only thing that stops
    // it firing — otherwise this repair would overwrite the very timestamp it
    // used as evidence, so a second run would date every row from the moment of
    // the first and happily shift them all again.
    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (const { item, to } of fixes) {
        await conn.query(
          "UPDATE itinerary_items SET completed_at = ?, updated_at = updated_at WHERE id = ?",
          [to, item.id],
        );
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      throw err;
    } finally {
      conn.release();
    }
    console.log(`\n${fixes.length} row(s) updated.`);
  }

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
