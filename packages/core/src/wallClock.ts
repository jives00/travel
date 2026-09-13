/** Conversions between the strings this app stores — "YYYY-MM-DD" and "HH:mm" —
 * and the `Date` objects a native picker hands back.
 *
 * Stored datetimes are **wall clock at the event's location** (see CLAUDE.md):
 * the zone is metadata resolved at read time, never baked into the string. So
 * every conversion here reads and writes the Date's *local* calendar fields
 * (`getFullYear`, `getHours`, …) and never its UTC ones. A picker that helpfully
 * round-tripped through `toISOString()` would shift every event by the device's
 * offset — a 09:00 flight saved in Chicago would read 15:00 once the phone
 * landed in Seville.
 *
 * This is deliberately the opposite of `dateOnly` in `tripDates.ts`, which
 * parses a stored "YYYY-MM-DD" at *UTC* midnight for comparison. Both are
 * correct: comparison happens in one fixed frame, entry happens in the frame
 * the user is looking at. Don't unify them.
 */

const YMD = /^\d{4}-\d{2}-\d{2}$/;
const HM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidYmd(s: string): boolean {
  if (!YMD.test(s)) return false;
  // Rejects 2026-02-30 and friends: the round-trip only survives a real date.
  const [y, m, d] = s.split("-").map(Number);
  const probe = new Date(y, m - 1, d);
  return probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d;
}

export function isValidHm(s: string): boolean {
  return HM.test(s);
}

/** A Date's local calendar date as "YYYY-MM-DD". */
export function dateToYmd(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** A Date's local clock time as "HH:mm" (24h, as stored). */
export function dateToHm(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" (+ optional "HH:mm") as a Date in the device's local frame —
 * the form a native picker wants for its initial value. Returns null for
 * anything malformed, so a bad stored string opens the picker on a sane default
 * instead of on Invalid Date. */
export function wallClockToDate(ymd: string, hm?: string | null): Date | null {
  if (!isValidYmd(ymd)) return null;
  const [y, m, d] = ymd.split("-").map(Number);
  if (hm && !isValidHm(hm)) return null;
  const [h, min] = hm ? hm.split(":").map(Number) : [0, 0];
  return new Date(y, m - 1, d, h, min, 0, 0);
}

/** A stored "HH:mm" as a Date, pinned to an arbitrary day — for a time picker,
 * which only reads the clock fields. */
export function hmToDate(hm: string, fallback: Date = new Date()): Date {
  if (!isValidHm(hm)) return fallback;
  const [h, m] = hm.split(":").map(Number);
  const d = new Date(fallback);
  d.setHours(h, m, 0, 0);
  return d;
}

/** Human label for a stored date, e.g. "Sat, Sep 13, 2026". Formatted in UTC
 * because the string is parsed at UTC midnight — formatting it locally would
 * name the previous day west of Greenwich. */
export function formatYmdLabel(ymd: string, locale = "en-US"): string {
  if (!isValidYmd(ymd)) return ymd;
  return new Intl.DateTimeFormat(locale, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${ymd}T00:00:00Z`));
}
