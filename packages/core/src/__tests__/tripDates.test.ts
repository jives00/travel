import { describe, it, expect, vi, afterEach } from "vitest";
import { todayUtcMidnight } from "../tripDates";

afterEach(() => {
  vi.useRealTimers();
});

describe("todayUtcMidnight", () => {
  it("uses the local calendar date, not the UTC one, in the evening west of Greenwich", () => {
    // 2026-08-25 20:00 in America/Chicago is already 2026-08-26 01:00 UTC —
    // truncating the UTC clock would skip a day and shorten every countdown.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-26T01:00:00Z"));
    process.env.TZ = "America/Chicago";
    expect(todayUtcMidnight().toISOString()).toBe("2026-08-25T00:00:00.000Z");
  });
});
