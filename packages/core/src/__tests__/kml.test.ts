import { describe, expect, it } from "vitest";
import { buildKmlLayer, escapeXml, kmlFileName } from "../kml";
import { createZip, crc32, utf8Bytes } from "../zip";
import { groupByLeg, legIdForScheduling } from "../exportGrouping";

const PADDLE = (name: string) => `https://maps.google.com/mapfiles/kml/paddle/${name}.png`;

describe("escapeXml", () => {
  it("escapes every XML-significant character", () => {
    expect(escapeXml(`Ben & Jerry's <"shop">`)).toBe(
      "Ben &amp; Jerry&apos;s &lt;&quot;shop&quot;&gt;",
    );
  });
});

describe("buildKmlLayer", () => {
  const kml = buildKmlLayer({
    name: "Barcelona",
    styles: [
      { id: "city", iconUrl: PADDLE("blu-diamond") },
      { id: "food_drinks", iconUrl: PADDLE("red-circle") },
    ],
    points: [
      { name: "Barcelona", lat: 41.38, lng: 2.17, styleId: "city" },
      {
        name: "Bar Cañete",
        lat: 41.3796,
        lng: 2.1745,
        styleId: "food_drinks",
        descriptionHtml: "<p>Tapas</p>",
        fields: [
          { name: "Status", value: "planned" },
          { name: "Note", value: "" },
        ],
      },
      // Unknown style — must not emit a dangling styleUrl reference.
      { name: "Mystery", lat: 41.4, lng: 2.2, styleId: "nope" },
    ],
  });

  it("emits lng,lat coordinates (KML order, not lat/lng)", () => {
    expect(kml).toContain("<coordinates>2.1745,41.3796,0</coordinates>");
  });

  it("defines every style once and points each pin at its own", () => {
    expect(kml).toContain('<Style id="s-city">');
    expect(kml).toContain('<Style id="s-food_drinks">');
    expect(kml).toContain(`<href>${PADDLE("blu-diamond")}</href>`);
    expect(kml).toContain(`<href>${PADDLE("red-circle")}</href>`);
    expect(kml).toContain("<styleUrl>#s-food_drinks</styleUrl>");
  });

  // My Maps renders the raw icon and drops any tint, so a <color> element would
  // do nothing there while distorting a pre-colored icon in Google Earth.
  it("emits no <color> tint alongside the pre-colored icons", () => {
    expect(kml).not.toContain("<color>");
  });

  it("falls back to the first style for an unknown styleId", () => {
    expect(kml).not.toContain("#s-nope");
    // "Mystery" is the third placemark and must reference the fallback style.
    const mystery = kml.slice(kml.indexOf("<name>Mystery</name>"));
    expect(mystery).toContain("<styleUrl>#s-city</styleUrl>");
  });

  it("escapes the layer name but leaves description HTML inside CDATA", () => {
    expect(kml).toContain("<name>Barcelona</name>");
    expect(kml).toContain("<![CDATA[<p>Tapas</p>]]>");
  });

  it("drops empty ExtendedData fields", () => {
    expect(kml).toContain('<Data name="Status"><value>planned</value></Data>');
    expect(kml).not.toContain('name="Note"');
  });
});

describe("kmlFileName", () => {
  it("slugifies the layer name", () => {
    expect(kmlFileName("Food & Drinks")).toBe("Food-Drinks.kml");
  });
});

describe("legIdForScheduling", () => {
  const legs = [
    { id: 1, startDate: "2026-05-01", endDate: "2026-05-04" },
    { id: 2, startDate: "2026-05-05", endDate: "2026-05-09" },
  ];

  it("prefers an explicit leg over the date range", () => {
    expect(legIdForScheduling({ id: 9, legId: 2, scheduledDate: "2026-05-02" }, legs)).toBe(2);
  });

  it("ignores an explicit leg that is not on this trip", () => {
    expect(legIdForScheduling({ id: 9, legId: 99, scheduledDate: "2026-05-02" }, legs)).toBeNull();
  });

  it("falls back to whichever leg's range covers the date", () => {
    expect(legIdForScheduling({ id: 9, legId: null, scheduledDate: "2026-05-06" }, legs)).toBe(2);
  });

  it("resolves to no leg when undated and unassigned", () => {
    expect(legIdForScheduling({ id: 9, legId: null, scheduledDate: null }, legs)).toBeNull();
  });

  it("tolerates a datetime string, not just YYYY-MM-DD", () => {
    expect(
      legIdForScheduling({ id: 9, legId: null, scheduledDate: "2026-05-03T10:00:00Z" }, legs),
    ).toBe(1);
  });
});

describe("groupByLeg", () => {
  const legs = [
    { id: 1, startDate: "2026-05-01", endDate: "2026-05-04" },
    { id: 2, startDate: "2026-05-05", endDate: "2026-05-09" },
  ];

  it("keeps the first resolving entry when a place is scheduled twice", () => {
    const map = groupByLeg(
      [
        { id: 7, legId: null, scheduledDate: "2026-05-02" },
        { id: 7, legId: 2, scheduledDate: "2026-05-06" },
      ],
      legs,
    );
    expect(map.get(7)).toBe(1);
  });

  it("leaves unresolvable places out entirely, so they land in Unscheduled", () => {
    const map = groupByLeg([{ id: 8, legId: null, scheduledDate: null }], legs);
    expect(map.has(8)).toBe(false);
  });

  // Bookings carry leg_id directly (nullable), so both branches are live for
  // them: a hotel assigned to a leg, and a dinner that only has a start_at.
  it("resolves bookings by explicit leg or by start date", () => {
    const map = groupByLeg(
      [
        { id: 1, legId: 2, scheduledDate: null }, // hotel pinned to a leg
        { id: 2, legId: null, scheduledDate: "2026-05-03T20:00:00Z" }, // dated dinner
        { id: 3, legId: null, scheduledDate: null }, // neither -> Unscheduled
      ],
      legs,
    );
    expect(map.get(1)).toBe(2);
    expect(map.get(2)).toBe(1);
    expect(map.has(3)).toBe(false);
  });
});

// Hand-rolled rather than TextEncoder (see zip.ts), so it is checked against
// Node's Buffer, which is the reference implementation here — the test runs in
// node even though the source deliberately cannot use Buffer.
describe("utf8Bytes", () => {
  const cases = [
    "plain ascii",
    "Bar Cañete", // 2-byte
    "Montjuïc / Güell", // 2-byte, repeated
    "日本語", // 3-byte
    "emoji 🗺️ pin 🏨", // 4-byte, surrogate pairs
    "", // empty
    "\u{10FFFF}", // highest code point
  ];

  for (const value of cases) {
    it(`matches Buffer for ${JSON.stringify(value)}`, () => {
      expect(Array.from(utf8Bytes(value))).toEqual(Array.from(Buffer.from(value, "utf8")));
    });
  }
});

describe("createZip", () => {
  it("computes the standard CRC-32", () => {
    // Known IEEE 802.3 check value for "123456789".
    expect(crc32(utf8Bytes("123456789"))).toBe(0xcbf43926);
  });

  it("writes a readable store-only archive", () => {
    const zip = createZip([
      { name: "a.kml", text: "hello" },
      { name: "b.kml", text: "world!" },
    ]);
    const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);

    expect(view.getUint32(0, true)).toBe(0x04034b50); // local header
    expect(view.getUint16(8, true)).toBe(0); // stored, not deflated

    // End-of-central-directory sits at the tail and reports both entries.
    const eocd = zip.length - 22;
    expect(view.getUint32(eocd, true)).toBe(0x06054b50);
    expect(view.getUint16(eocd + 10, true)).toBe(2);

    // Central directory offset/size must land exactly on the first central header.
    const cdSize = view.getUint32(eocd + 12, true);
    const cdOffset = view.getUint32(eocd + 16, true);
    expect(view.getUint32(cdOffset, true)).toBe(0x02014b50);
    expect(cdOffset + cdSize).toBe(eocd);
  });
});
