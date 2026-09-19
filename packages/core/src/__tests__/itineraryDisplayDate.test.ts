import { describe, expect, it } from "vitest";
import { itineraryDisplayDate } from "../itineraryCategory";

describe("itineraryDisplayDate", () => {
  it("places a completed entry on the day it was done, not the day it was planned", () => {
    // The case this rule exists for: Segovia was booked for the 19th and done
    // on the 18th. Filing it under the 19th showed a day that hadn't started
    // yet already ticked off.
    expect(itineraryDisplayDate({ scheduledDate: "2026-09-19", completedAt: "2026-09-18" })).toBe("2026-09-18");
  });

  it("places an unscheduled entry on the day it was checked off", () => {
    expect(itineraryDisplayDate({ scheduledDate: null, completedAt: "2026-09-17" })).toBe("2026-09-17");
  });

  it("falls back to the plan for anything not checked off", () => {
    expect(itineraryDisplayDate({ scheduledDate: "2026-09-19", completedAt: null })).toBe("2026-09-19");
    expect(itineraryDisplayDate({ scheduledDate: "2026-09-19" })).toBe("2026-09-19");
  });

  it("is null when there is neither", () => {
    expect(itineraryDisplayDate({ scheduledDate: null, completedAt: null })).toBeNull();
  });
});
