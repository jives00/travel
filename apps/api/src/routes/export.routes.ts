import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  buildKmlLayer,
  createZip,
  groupByLeg,
  kmlFileName,
  mapPinGroupForBookingType,
  mapPinGroupForTag,
  myMapsIconUrl,
  type KmlPoint,
  type KmlStyle,
} from "@travel/core";
import { MAP_PIN_STYLES, mapPinStyleKeyFor, type MapPinStyleKey } from "@travel/ui-tokens";
import { authenticate } from "../middleware/auth";
import { getPool } from "../db";
import { geocodeCity } from "../services/weather.client";

function userId(request: FastifyRequest): number {
  return (request.user as { sub: number }).sub;
}

interface ExportPlaceRow {
  id: number;
  googlePlaceId: string | null;
  name: string;
  primaryTag: string;
  status: string;
  address: string | null;
  lat: number;
  lng: number;
  rating: number | null;
  userRatingsTotal: number | null;
  website: string | null;
  description: string | null;
  note: string | null;
}

interface ExportLegRow {
  id: number;
  city: string;
  startDate: string | null;
  endDate: string | null;
  lat: number | null;
  lng: number | null;
}

interface ScheduleRow {
  id: number;
  legId: number | null;
  scheduledDate: string | null;
}

/** Hotels and the rest live in `bookings`, not `places` — migration 017 gave
 * bookings their own address/lat/lng precisely so a hotel needn't be forced
 * into the place library just to be plotted. A booking may still carry its
 * location indirectly through `place_id`, hence the COALESCE in the query. */
interface ExportBookingRow {
  id: number;
  googlePlaceId: string | null;
  type: string;
  title: string;
  legId: number | null;
  // DATETIME, not DATE — the pool's `dateStrings` is scoped to DATE only (see
  // db.ts), so mysql2 hands these back as JS Date objects. Normalize with
  // toIsoMinutes() before any string work.
  startAt: Date | string | null;
  endAt: Date | string | null;
  address: string | null;
  lat: number;
  lng: number;
  notes: string | null;
}

// Layers are grouped by city, so every layer carries the full per-category set
// of styles and each pin picks its own — a city layer then reads much like the
// trip map here. (My Maps lets you restyle a layer after import; this is the
// starting point.)
//
// Styled by the app's own six pin styles rather than by the nine place tags, so
// an exported map reads exactly like the trip map: colors come straight from
// MAP_PIN_STYLES and the glyphs are Google's nearest equivalents of the app's.
//
// This used to be a hand-mapped approximation onto the nine `mapfiles/kml/paddle`
// colors, because My Maps drops `<IconStyle><color>` on import and so needs
// pre-colored images. myMapsIconUrl() removes that constraint — the color is a
// URL parameter, so every pin here is the app's exact hex *and* carries a glyph.
//
// Glyph ids are Google's own and are verified against the live icon service; a
// wrong id 404s and renders as a missing pin rather than an error. Note the ids
// are named for Google's taxonomy, not for what they draw — 1577-food-fork-knife
// renders a fork and a *spoon*, which is what the app draws — so confirm a glyph
// by looking at it, not by reading its id.
//
// Small knowing drift from the app: the bicycle here carries a rider and the
// app's does not. Everything else is the same glyph.
//
// The app's `private` style has no counterpart here on purpose. Privacy in the
// app is an over-the-shoulder concern — the trip map hides those pins, or draws
// them as a featureless "?", because someone may be looking at the screen — but
// this export is a file you import into your own My Maps, where a disguised pin
// is just a map that is wrong for you. Private items are therefore exported
// under their real name and real category, and no `private` style is emitted.
const CITY_STYLE_ID = "city";

// The city anchor is not one of the app's pin styles — it marks the leg itself,
// not a place — so it gets a flag, and a blue no pin style uses.
const CITY_COLOR = "#1a73e8";
const CITY_GLYPH = "1574-flag";

const STYLE_GLYPHS: Record<MapPinStyleKey, string | null> = {
  default: null, // a plain pin, matching the app's glyphless default
  food_drinks: "1577-food-fork-knife",
  lodging: "1603-house",
  nightlife: "1517-bar-cocktail",
  // Never emitted (see above). Present only to keep this record exhaustive, so
  // that adding a style to MAP_PIN_STYLES still fails to compile until someone
  // has decided what it draws here.
  private: null,
  transit: "1522-bicycle",
};

const PLACE_STYLES: KmlStyle[] = [
  { id: CITY_STYLE_ID, iconUrl: myMapsIconUrl(CITY_COLOR, CITY_GLYPH) },
  ...(Object.keys(STYLE_GLYPHS) as MapPinStyleKey[])
    .filter((key) => key !== "private")
    .map((key) => ({
      id: key,
      iconUrl: myMapsIconUrl(MAP_PIN_STYLES[key].color, STYLE_GLYPHS[key]),
    })),
];

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** The info card body. Sections are separated by a blank line rather than a
 * single break: this block is the only prose on the card, and My Maps renders
 * it as one unbroken run otherwise.
 *
 * Only the things *you* wrote go here. Address, dates, rating and website are
 * facts, and facts belong in ExtendedData where My Maps gives them their own
 * labelled rows — putting them in both (which this used to do) printed every
 * value on the card twice. */
function describe(sections: (string | null)[]): string | null {
  const kept = sections.filter((line): line is string => line != null && line !== "");
  return kept.length > 0 ? kept.join("<br><br>") : null;
}

/** A short link to the real Google listing, which carries the hours, photos and
 * reviews no import format can bring across.
 *
 * Deliberately terse, and deliberately *not* an `<a>`: My Maps flattens anchors
 * on import and renders the href itself, so the old
 * `maps/search/?api=1&query=<lat>,<lng>&query_place_id=<id>` form — 130-odd
 * characters behind the words "Open in Google Maps" — arrived as a wall of URL.
 * This form is a third of the length and resolves to the same listing. The
 * protocol stays on so My Maps still autolinks it. */
function mapsLink(googlePlaceId: string | null, name: string, address: string | null): string {
  if (googlePlaceId) return `https://maps.google.com/?q=place_id:${encodeURIComponent(googlePlaceId)}`;
  // Bookings are not drawn from the place library, so most have no place id.
  // Spaces and commas are left legible rather than percent-encoded — `+` is a
  // valid space in a query string, and %20/%2C everywhere turned a readable
  // address into the same unreadable URL this function exists to shorten.
  const query = [name, address].filter((part): part is string => !!part).join(", ");
  const encoded = encodeURIComponent(query).replace(/%20/g, "+").replace(/%2C/g, ",");
  return `https://maps.google.com/?q=${encoded}`;
}

/** "4.5 ★ (2,341 reviews)" — the bare "Rating: 4.5" this replaces never said
 * out of what, or whose. It is Google's rating, and the count is the part that
 * says whether to trust it. */
function formatRating(rating: number | null, total: number | null): string {
  if (rating == null) return "";
  const stars = `${rating} ★`;
  return total ? `${stars} (${total.toLocaleString("en-US")} reviews)` : stars;
}

/** Drops the protocol and any trailing slash. The anchor would not survive the
 * import anyway, so this is read, not clicked, and the bare host reads better. */
function formatWebsite(website: string | null): string {
  if (!website) return "";
  return website.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function placeToPoint(row: ExportPlaceRow): KmlPoint {
  return {
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    // Via the app's own tag -> group -> style collapse, so a place and the same
    // place's booking land on one style. mapPinGroupForTag also absorbs a null
    // primaryTag, which previously fell through to the layer's first style and
    // drew an untagged place as the city anchor.
    styleId: mapPinStyleKeyFor(mapPinGroupForTag(row.primaryTag)),
    descriptionHtml: describe([
      // Your note leads: it is the reason the place was saved. `description` is
      // Google's own editorial summary (editorialSummary.text, see
      // google-places.client.ts), so it is labelled and follows.
      row.note ? `<b>Note:</b> ${escapeHtml(row.note)}` : null,
      row.description ? `<b>About:</b> ${escapeHtml(row.description)}` : null,
      escapeHtml(mapsLink(row.googlePlaceId, row.name, row.address)),
    ]),
    // No Category or Status row: the pin's colour and glyph already say the
    // category, and status is an app-side workflow state (idea/planned/visited)
    // that means nothing on an exported map.
    fields: [
      { name: "Address", value: row.address ?? "" },
      { name: "Rating", value: formatRating(row.rating, row.userRatingsTotal) },
      { name: "Website", value: formatWebsite(row.website) },
    ],
  };
}

/** "YYYY-MM-DDTHH:mm" from either shape mysql2 might return. Reads the Date in
 * UTC via toISOString(), exactly as the web UI does when it slices startAt for
 * its own date/time inputs — so the export always shows the same clock time the
 * app does, whatever the viewer's local zone. */
function toIsoMinutes(value: Date | string | null): string | null {
  if (value == null) return null;
  const iso = value instanceof Date ? value.toISOString() : String(value).replace(" ", "T");
  return iso.slice(0, 16);
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 4, 2026", or "Oct 4, 2026 14:30" when a time was actually set.
 *
 * Reads the "YYYY-MM-DDTHH:mm" string field by field rather than handing it to
 * a Date: the string is already wall clock at the event's location (see the
 * stored-datetimes rule in CLAUDE.md), so re-parsing it would reintroduce the
 * zone shift toIsoMinutes() exists to avoid.
 *
 * Hotel check-in/out and other all-day bookings are stored at midnight (the
 * booking form writes "00:00" when the time is left blank), so a trailing
 * 00:00 means "no time set" and is dropped rather than printed as noise. */
function formatWhen(value: Date | string | null): string | null {
  const iso = toIsoMinutes(value);
  if (iso == null) return null;
  const [date, time] = iso.split("T");
  const [year, month, day] = date.split("-");
  const label = `${MONTHS[Number(month) - 1]} ${Number(day)}, ${year}`;
  return time === "00:00" ? label : `${label} ${time}`;
}

/** A booking's date row. A same-year range drops the repeated year from the
 * start ("Oct 4 – Oct 8, 2026"); anything else prints both in full. */
function formatDateRange(startAt: Date | string | null, endAt: Date | string | null): string {
  const start = formatWhen(startAt);
  const end = formatWhen(endAt);
  if (start == null) return end ?? "";
  if (end == null) return start;
  const sameYear = toIsoMinutes(startAt)?.slice(0, 4) === toIsoMinutes(endAt)?.slice(0, 4);
  return `${sameYear ? start.replace(/, \d{4}/, "") : start} – ${end}`;
}

function bookingToPoint(row: ExportBookingRow): KmlPoint {
  return {
    name: row.title,
    lat: row.lat,
    lng: row.lng,
    // Same styles the places use, via the app's own booking-type -> pin group
    // mapping, so a hotel pin matches the lodging color everywhere else.
    styleId: mapPinStyleKeyFor(mapPinGroupForBookingType(row.type)),
    // Confirmation codes are deliberately left out: a My Map is one "share"
    // click away from being public, and a booking reference is the one field
    // here that would actually matter if it leaked.
    descriptionHtml: describe([
      row.notes ? `<b>Note:</b> ${escapeHtml(row.notes)}` : null,
      escapeHtml(mapsLink(row.googlePlaceId, row.title, row.address)),
    ]),
    // Reads in the same order as a place, minus the rows a booking has no
    // source for. The type is carried by the pin rather than repeated as a
    // bold first line *and* a Category row, as it was before.
    fields: [
      { name: "Dates", value: formatDateRange(row.startAt, row.endAt) },
      { name: "Address", value: row.address ?? "" },
    ],
  };
}

function safeFileName(name: string): string {
  return name.replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-") || "trip";
}

export async function exportRoutes(app: FastifyInstance): Promise<void> {
  const auth = { preHandler: [authenticate] };

  /** One KML per city (leg), zipped. Google My Maps has no write API (the Maps
   * Engine API was retired in 2015) so there is no way to push this — the file
   * is imported by hand, and My Maps makes one layer per file, capped at 10
   * layers / 2,000 features each. */
  app.get<{ Params: { tripId: string } }>("/:tripId/export/kml", auth, async (request, reply) => {
    const uid = userId(request);
    const tripId = Number(request.params.tripId);

    const [tripRows] = await getPool().query("SELECT id, name FROM trips WHERE id = ? AND user_id = ?", [
      tripId,
      uid,
    ]);
    const trip = (tripRows as { id: number; name: string }[])[0];
    if (!trip) return reply.code(404).send({ error: "not found" });

    const [placeRows] = await getPool().query(
      `SELECT p.id, p.google_place_id AS googlePlaceId, p.name, p.primary_tag AS primaryTag, p.status,
              p.address, p.lat, p.lng, p.rating, p.user_ratings_total AS userRatingsTotal,
              p.website, p.description, p.note
       FROM places p
       JOIN trip_places tp ON tp.place_id = p.id AND tp.trip_id = ?
       WHERE p.user_id = ?
       ORDER BY p.name`,
      [tripId, uid],
    );
    const places = placeRows as ExportPlaceRow[];

    const [legRows] = await getPool().query(
      `SELECT id, city, start_date AS startDate, end_date AS endDate, lat, lng
       FROM legs WHERE trip_id = ? ORDER BY sort_order`,
      [tripId],
    );
    const legs = legRows as ExportLegRow[];

    // Ordered so a place scheduled in two cities takes its earliest occurrence
    // (groupByLeg keeps the first entry that resolves).
    const [scheduleRows] = await getPool().query(
      `SELECT place_id AS id, leg_id AS legId, scheduled_date AS scheduledDate
       FROM itinerary_items
       WHERE trip_id = ? AND item_type = 'place' AND place_id IS NOT NULL
       ORDER BY scheduled_date IS NULL, scheduled_date, sort_order`,
      [tripId],
    );
    const legByPlaceId = groupByLeg(scheduleRows as ScheduleRow[], legs);

    // Every booking type is included, matching what trip-map.tsx plots — a
    // hotel, a dinner reservation and a train station are all locations you
    // want on the map. Completed bookings are kept (the in-app map hides them,
    // but an export is a snapshot of the whole trip, and silently dropping a
    // past trip's hotels would be worse).
    const [bookingRows] = await getPool().query(
      `SELECT b.id, p.google_place_id AS googlePlaceId, b.type, b.title, b.leg_id AS legId,
              b.start_at AS startAt, b.end_at AS endAt,
              COALESCE(b.address, p.address) AS address,
              COALESCE(b.lat, p.lat) AS lat,
              COALESCE(b.lng, p.lng) AS lng,
              b.notes
       FROM bookings b
       LEFT JOIN places p ON p.id = b.place_id
       WHERE b.trip_id = ? AND COALESCE(b.lat, p.lat) IS NOT NULL AND COALESCE(b.lng, p.lng) IS NOT NULL
       ORDER BY b.start_at IS NULL, b.start_at, b.id`,
      [tripId],
    );
    const bookings = bookingRows as ExportBookingRow[];
    const legByBookingId = groupByLeg(
      bookings.map((b) => ({ id: b.id, legId: b.legId, scheduledDate: toIsoMinutes(b.startAt) })),
      legs,
    );

    const entries: { name: string; text: string }[] = [];

    for (const leg of legs) {
      const points: KmlPoint[] = [];

      // The city pin itself anchors its own layer. Same lazily-populated
      // lat/lng cache the map overview fills in — a leg added but never
      // rendered on the map has no coordinates yet.
      let { lat, lng } = leg;
      if (lat == null || lng == null) {
        const geo = await geocodeCity(leg.city).catch(() => null);
        if (geo) {
          lat = geo.lat;
          lng = geo.lng;
          await getPool().query("UPDATE legs SET lat = ?, lng = ? WHERE id = ?", [lat, lng, leg.id]);
        }
      }
      if (lat != null && lng != null) {
        const dates = [leg.startDate, leg.endDate].filter(Boolean).join(" – ");
        points.push({
          name: leg.city,
          lat,
          lng,
          styleId: CITY_STYLE_ID,
          descriptionHtml: dates || null,
          fields: [
            { name: "Category", value: "City" },
            { name: "Dates", value: dates },
          ],
        });
      }

      for (const booking of bookings) {
        if (legByBookingId.get(booking.id) === leg.id) points.push(bookingToPoint(booking));
      }
      for (const place of places) {
        if (legByPlaceId.get(place.id) === leg.id) points.push(placeToPoint(place));
      }

      if (points.length === 0) continue;
      entries.push({
        name: kmlFileName(leg.city),
        text: buildKmlLayer({ name: leg.city, styles: PLACE_STYLES, points }),
      });
    }

    // Ideas-tray places never scheduled onto a day, and bookings with neither a
    // leg nor a date, resolve to no city. Deliberately not assigned to the
    // nearest one — a guess would silently put pins in the wrong layer.
    const unscheduled: KmlPoint[] = [
      ...bookings.filter((b) => !legByBookingId.has(b.id)).map(bookingToPoint),
      ...places.filter((p) => !legByPlaceId.has(p.id)).map(placeToPoint),
    ];
    if (unscheduled.length > 0) {
      const layerName = "Unscheduled";
      entries.push({
        name: kmlFileName(layerName),
        text: buildKmlLayer({ name: layerName, styles: PLACE_STYLES, points: unscheduled }),
      });
    }

    if (entries.length === 0) return reply.code(404).send({ error: "nothing to export" });

    const zip = createZip(entries);
    return reply
      .header("Content-Type", "application/zip")
      .header("Content-Disposition", `attachment; filename="${safeFileName(trip.name)}-my-maps.zip"`)
      .send(Buffer.from(zip));
  });
}
