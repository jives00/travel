import { describe, expect, it } from "vitest";
import { todayInTripZone, todayInZone } from "../timezone";

const legs = [
  { id: 1, timezone: "Europe/Madrid", startDate: "2026-09-14", endDate: "2026-09-20" },
  { id: 2, timezone: "Africa/Casablanca", startDate: "2026-09-21", endDate: "2026-09-25" },
];

describe("todayInZone", () => {
  // 2026-09-19T06:50Z is 08:50 in Madrid but still the 18th in Chicago.
  const morning = new Date("2026-09-19T06:50:00Z");

  it("reads the calendar date in the given zone", () => {
    expect(todayInZone("Europe/Madrid", morning)).toBe("2026-09-19");
    expect(todayInZone("America/Chicago", morning)).toBe("2026-09-19");
    expect(todayInZone("Pacific/Auckland", morning)).toBe("2026-09-19");
  });

  it("crosses the date line in both directions", () => {
    const evening = new Date("2026-09-19T23:30:00Z");
    expect(todayInZone("Europe/Madrid", evening)).toBe("2026-09-20");
    expect(todayInZone("America/Chicago", evening)).toBe("2026-09-19");
    expect(todayInZone("Pacific/Auckland", evening)).toBe("2026-09-20");
  });

  it("falls back to the device date with no zone or an unknown one", () => {
    // The device's own date, whatever zone the test runner is in.
    const d = new Date("2026-09-19T12:00:00Z");
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(todayInZone(null, d)).toBe(local);
    expect(todayInZone("Not/AZone", d)).toBe(local);
  });
});

describe("todayInTripZone", () => {
  it("uses the covering leg's zone, not the device's", () => {
    // 01:30 UTC on the 19th: already the 19th in Madrid, still the 18th in the US.
    const late = new Date("2026-09-19T01:30:00Z");
    expect(todayInTripZone({ legs, homeTimezone: "America/Chicago" }, late)).toBe("2026-09-19");
  });

  it("re-resolves against the leg the shifted date actually lands in", () => {
    // 23:30 UTC on the 20th is already the 21st in Madrid — which is leg 2's
    // first day, so the second pass asks Casablanca, which agrees on the 21st.
    const boundary = new Date("2026-09-20T23:30:00Z");
    expect(todayInTripZone({ legs }, boundary)).toBe("2026-09-21");
  });

  it("falls through to the home zone off the trip", () => {
    const d = new Date("2026-10-01T02:00:00Z");
    expect(todayInTripZone({ legs, homeTimezone: "America/Chicago" }, d)).toBe("2026-09-30");
  });

  it("is the device's date when nothing resolves a zone", () => {
    const d = new Date("2026-10-01T12:00:00Z");
    const local = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    expect(todayInTripZone({ legs: [] }, d)).toBe(local);
  });
});
