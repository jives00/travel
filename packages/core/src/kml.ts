/** KML generation for exporting a trip's mapped locations into Google My Maps.
 *
 * My Maps has no write API (the Maps Engine API was retired in 2015), so the
 * only supported path is a manual import. My Maps creates **one layer per
 * imported file** and caps a map at 10 layers / 2,000 features per layer, which
 * is why the export emits a separate small KML per city rather than one big
 * document with folders (folder handling on import is inconsistent).
 *
 * A layer carries several styles rather than one: layers are grouped by city,
 * but the pins inside them stay colored by place category, so a city layer
 * reads the same as the trip map here.
 *
 * Kept platform-free (no Buffer/DOM) so web, mobile and the API can all use it.
 */

export interface KmlField {
  name: string;
  value: string;
}

export interface KmlStyle {
  /** Referenced by KmlPoint.styleId. */
  id: string;
  /**
   * Must be a **pre-colored** icon, not a neutral one plus a tint. Google My
   * Maps drops `<IconStyle><color>` on import and renders the raw image, so
   * tinting a neutral icon (e.g. shapes/placemark_circle.png) arrives as a
   * black bullseye for every category. The maps.google.com/mapfiles/kml/paddle
   * set ships one image per color, which survives the import intact.
   */
  iconUrl: string;
}

export interface KmlPoint {
  name: string;
  lat: number;
  lng: number;
  /** Rendered into <description> as simple HTML inside CDATA. */
  descriptionHtml?: string | null;
  /** Surfaced by My Maps as per-feature data columns (styleable/filterable). */
  fields?: KmlField[];
  /** Falls back to the layer's first style when missing or unknown. */
  styleId?: string;
}

export interface KmlLayer {
  /** Becomes the layer name in My Maps — the file name is what actually shows,
   * so the caller keeps the two in sync. */
  name: string;
  styles: KmlStyle[];
  points: KmlPoint[];
}

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// CDATA can't contain the terminator itself; splitting it across two sections
// is the standard way to keep arbitrary HTML safe inside one.
function cdata(html: string): string {
  return `<![CDATA[${html.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

// XML ids can't start with a digit and allow a limited character set, so the
// caller's free-text style keys (place tags, "city") are normalized once here
// and at the reference site, keeping the two in sync by construction.
function styleRef(id: string): string {
  return `s-${id.replace(/[^\w-]/g, "-")}`;
}

function placemark(point: KmlPoint, styleId: string): string {
  const parts = [
    "    <Placemark>",
    `      <name>${escapeXml(point.name)}</name>`,
    `      <styleUrl>#${styleRef(styleId)}</styleUrl>`,
  ];
  if (point.descriptionHtml) {
    parts.push(`      <description>${cdata(point.descriptionHtml)}</description>`);
  }
  const fields = (point.fields ?? []).filter((f) => f.value !== "");
  if (fields.length > 0) {
    parts.push("      <ExtendedData>");
    for (const f of fields) {
      parts.push(
        `        <Data name="${escapeXml(f.name)}"><value>${escapeXml(f.value)}</value></Data>`,
      );
    }
    parts.push("      </ExtendedData>");
  }
  // KML coordinate order is lng,lat — the opposite of every lat/lng pair
  // elsewhere in this codebase.
  parts.push(
    "      <Point>",
    `        <coordinates>${point.lng},${point.lat},0</coordinates>`,
    "      </Point>",
    "    </Placemark>",
  );
  return parts.join("\n");
}

// No <color> element: with a pre-colored icon a tint would multiply against the
// image in the viewers that DO honor it (Google Earth), distorting the color,
// while the one that matters here (My Maps) ignores it anyway.
function style(s: KmlStyle): string {
  return [
    `    <Style id="${styleRef(s.id)}">`,
    "      <IconStyle>",
    "        <scale>1.1</scale>",
    `        <Icon><href>${escapeXml(s.iconUrl)}</href></Icon>`,
    "      </IconStyle>",
    "    </Style>",
  ].join("\n");
}

export function buildKmlLayer(layer: KmlLayer): string {
  const known = new Set(layer.styles.map((s) => s.id));
  const fallback = layer.styles[0]?.id ?? "default";
  const styles: KmlStyle[] =
    layer.styles.length > 0
      ? layer.styles
      : [{ id: fallback, iconUrl: "https://maps.google.com/mapfiles/kml/paddle/wht-circle.png" }];

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<kml xmlns="http://www.opengis.net/kml/2.2">',
    "  <Document>",
    `    <name>${escapeXml(layer.name)}</name>`,
    ...styles.map(style),
    ...layer.points.map((p) =>
      placemark(p, p.styleId && known.has(p.styleId) ? p.styleId : fallback),
    ),
    "  </Document>",
    "</kml>",
    "",
  ].join("\n");
}

/** Safe, readable file name for a layer — My Maps shows the file name as the
 * initial layer name, so this is user-visible. */
export function kmlFileName(layerName: string): string {
  const slug = layerName
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
  return `${slug || "layer"}.kml`;
}
