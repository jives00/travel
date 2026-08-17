import type { FastifyInstance, FastifyRequest } from "fastify";
import {
  BOOKING_TYPES,
  PLACE_TAGS,
  buildKmlLayer,
  createZip,
  enumLabel,
  groupByLeg,
  kmlFileName,
  mapPinGroupForBookingType,
  type KmlPoint,
  type KmlStyle,
} from "@travel/core";
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

const TAG_LABELS = new Map(PLACE_TAGS.map((t) => [t.key, t.label]));

// Layers are grouped by city, so every layer carries the full per-category set
// of styles and each pin picks its own — a city layer then reads much like the
// trip map here. (My Maps lets you restyle a layer after import; this is the
// starting point.)
//
// Hand-mapped onto Google's pre-colored paddle icons rather than derived from
// MAP_PIN_COLORS: My Maps ignores `<IconStyle><color>`, so the exact in-app hex
// cannot be reproduced — only approximated by the nearest of the nine paddle
// colors (blu, grn, ltblu, orange, pink, purple, red, wht, ylw). Kept in the
// same order as PLACE_TAGS so a new tag is obviously missing from here.
const PADDLE = (name: string) => `https://maps.google.com/mapfiles/kml/paddle/${name}.png`;
const CITY_STYLE_ID = "city";
const TAG_ICONS: Record<string, string> = {
  activity: PADDLE("ltblu-circle"), // #1baf7a teal-green
  day_trip: PADDLE("orange-circle"), // #eb6834
  food_drinks: PADDLE("red-circle"), // #e34948
  lodging: PADDLE("purple-circle"), // #4a3aa7
  nightlife: PADDLE("pink-circle"), // #c026d3
  other: PADDLE("wht-circle"), // neutral fallback
  shopping: PADDLE("ylw-circle"), // #eda100
  site: PADDLE("grn-circle"), // #008300
  transit: PADDLE("blu-circle"), // #2a78d6
};
const PLACE_STYLES: KmlStyle[] = [
  // A diamond, not a circle — the city anchor should read differently from the
  // places around it even though both are blue.
  { id: CITY_STYLE_ID, iconUrl: PADDLE("blu-diamond") },
  ...PLACE_TAGS.map((tag) => ({
    id: tag.key,
    iconUrl: TAG_ICONS[tag.key] ?? PADDLE("wht-circle"),
  })),
];

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function placeToPoint(row: ExportPlaceRow): KmlPoint {
  const lines: string[] = [];
  if (row.address) lines.push(escapeHtml(row.address));
  if (row.description) lines.push(escapeHtml(row.description));
  if (row.note) lines.push(`<b>Note:</b> ${escapeHtml(row.note)}`);
  if (row.rating != null) lines.push(`Rating: ${row.rating}`);
  if (row.website) {
    const href = encodeURI(row.website);
    lines.push(`<a href="${escapeHtml(href)}">${escapeHtml(row.website)}</a>`);
  }
  // Deep-links the pin back to the real Google listing, which carries hours,
  // photos and reviews that no import format can bring across.
  if (row.googlePlaceId) {
    const url = `https://www.google.com/maps/search/?api=1&query=${row.lat},${row.lng}&query_place_id=${encodeURIComponent(row.googlePlaceId)}`;
    lines.push(`<a href="${escapeHtml(url)}">Open in Google Maps</a>`);
  }

  return {
    name: row.name,
    lat: row.lat,
    lng: row.lng,
    styleId: row.primaryTag,
    descriptionHtml: lines.join("<br>") || null,
    fields: [
      { name: "Category", value: TAG_LABELS.get(row.primaryTag) ?? row.primaryTag },
      { name: "Status", value: row.status },
      { name: "Address", value: row.address ?? "" },
      { name: "Note", value: row.note ?? "" },
      { name: "Website", value: row.website ?? "" },
      { name: "Rating", value: row.rating != null ? String(row.rating) : "" },
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

/** Hotel check-in/out and other all-day bookings are stored at midnight (the
 * booking form defaults the time to "00:00" when left blank), so printing
 * "00:00" would be noise rather than information. */
function formatWhen(value: Date | string | null): string | null {
  const iso = toIsoMinutes(value);
  if (iso == null) return null;
  return iso.endsWith("T00:00") ? iso.slice(0, 10) : iso.replace("T", " ");
}

function bookingToPoint(row: ExportBookingRow): KmlPoint {
  const typeLabel = enumLabel(BOOKING_TYPES, row.type);
  const when = [formatWhen(row.startAt), formatWhen(row.endAt)]
    .filter((d): d is string => d != null)
    .join(" – ");

  const lines: string[] = [`<b>${escapeHtml(typeLabel)}</b>`];
  if (when) lines.push(escapeHtml(when));
  if (row.address) lines.push(escapeHtml(row.address));
  if (row.notes) lines.push(escapeHtml(row.notes));
  // Confirmation codes are deliberately left out: a My Map is one "share" click
  // away from being public, and a booking reference is the one field here that
  // would actually matter if it leaked.

  return {
    name: row.title,
    lat: row.lat,
    lng: row.lng,
    // Same tag styles the places use, via the app's own booking-type -> pin
    // group mapping, so a hotel pin matches the lodging color everywhere else.
    styleId: mapPinGroupForBookingType(row.type),
    descriptionHtml: lines.join("<br>"),
    fields: [
      { name: "Category", value: typeLabel },
      { name: "Booking", value: "yes" },
      { name: "Dates", value: when },
      { name: "Address", value: row.address ?? "" },
      { name: "Note", value: row.notes ?? "" },
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
              p.address, p.lat, p.lng, p.rating, p.website, p.description, p.note
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
      `SELECT b.id, b.type, b.title, b.leg_id AS legId, b.start_at AS startAt, b.end_at AS endAt,
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
