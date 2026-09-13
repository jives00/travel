import { describe, expect, it } from "vitest";
import {
  dateToHm,
  dateToYmd,
  formatYmdLabel,
  hmToDate,
  isValidHm,
  isValidYmd,
  wallClockToDate,
} from "../wallClock";

describe("isValidYmd", () => {
  it("accepts a real date", () => {
    expect(isValidYmd("2026-09-13")).toBe(true);
  });

  it("rejects the shapes a keyboard used to allow", () => {
    for (const bad of ["", "2026-9-13", "13/09/2026", "2026-09-13T00:00", "tomorrow"]) {
      expect(isValidYmd(bad)).toBe(false);
    }
  });

  it("rejects a well-shaped but nonexistent date", () => {
    expect(isValidYmd("2026-02-30")).toBe(false);
    expect(isValidYmd("2026-13-01")).toBe(false);
    // 2028 is a leap year, 2026 is not.
    expect(isValidYmd("2028-02-29")).toBe(true);
    expect(isValidYmd("2026-02-29")).toBe(false);
  });
});

describe("isValidHm", () => {
  it("accepts 24h times including midnight", () => {
    expect(isValidHm("00:00")).toBe(true);
    expect(isValidHm("23:59")).toBe(true);
  });

  it("rejects out-of-range and mis-shaped times", () => {
    for (const bad of ["", "24:00", "9:00", "07:60", "7pm"]) {
      expect(isValidHm(bad)).toBe(false);
    }
  });
});

describe("local wall-clock round trip", () => {
  it("reads and writes local calendar fields, not UTC ones", () => {
    // A picker hands back a local Date; what we store must be the date and time
    // the user saw, whatever the device's offset is. Constructing with the local
    // `Date` constructor and reading back must be lossless.
    const picked = new Date(2026, 8, 13, 9, 5);
    expect(dateToYmd(picked)).toBe("2026-09-13");
    expect(dateToHm(picked)).toBe("09:05");
  });

  it("survives a full string -> Date -> string trip", () => {
    const d = wallClockToDate("2026-09-13", "19:30")!;
    expect(dateToYmd(d)).toBe("2026-09-13");
    expect(dateToHm(d)).toBe("19:30");
  });

  it("keeps the late-evening date that a UTC round trip would advance", () => {
    // The bug this guards: `new Date("2026-09-13T23:30").toISOString().slice(0,10)`
    // is 2026-09-14 anywhere west of Greenwich.
    const d = wallClockToDate("2026-09-13", "23:30")!;
    expect(dateToYmd(d)).toBe("2026-09-13");
  });

  it("returns null for a malformed value so the picker can fall back", () => {
    expect(wallClockToDate("")).toBeNull();
    expect(wallClockToDate("13/09/2026")).toBeNull();
    expect(wallClockToDate("2026-09-13", "nope")).toBeNull();
  });
});

describe("hmToDate", () => {
  it("sets the clock fields on the fallback day", () => {
    const base = new Date(2026, 0, 1, 3, 3, 3, 3);
    const d = hmToDate("14:45", base);
    expect(dateToHm(d)).toBe("14:45");
    expect(dateToYmd(d)).toBe("2026-01-01");
    expect(d.getSeconds()).toBe(0);
  });

  it("returns the fallback untouched when unset", () => {
    const base = new Date(2026, 0, 1, 9, 0);
    expect(hmToDate("", base)).toBe(base);
  });

  it("treats midnight as a real time, not as unset", () => {
    const base = new Date(2026, 0, 1, 9, 0);
    expect(dateToHm(hmToDate("00:00", base))).toBe("00:00");
  });
});

describe("formatYmdLabel", () => {
  it("names the stored day, not the day before", () => {
    expect(formatYmdLabel("2026-09-13")).toBe("Sun, Sep 13, 2026");
  });

  it("passes a malformed value through rather than showing Invalid Date", () => {
    expect(formatYmdLabel("nope")).toBe("nope");
  });
});
