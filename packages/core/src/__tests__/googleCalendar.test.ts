import { describe, expect, it } from "vitest";
import { bookingCalendarUrl, googleCalendarUrl, itineraryCalendarUrl, resolveTimezone } from "../googleCalendar";

function params(url: string | null): URLSearchParams {
  return new URL(url!).searchParams;
}

describe("googleCalendarUrl", () => {
  it("gives a timed event the default hour when nothing says when it ends", () => {
    const url = googleCalendarUrl({ title: "Dinner", start: "2026-08-17T19:30:00.000Z" });
    expect(params(url).get("dates")).toBe("20260817T193000/20260817T203000");
    expect(params(url).get("text")).toBe("Dinner");
  });

  it("keeps a real end time, across midnight", () => {
    const url = googleCalendarUrl({ title: "Red-eye", start: "2026-08-17T22:00", end: "2026-08-18T06:15" });
    expect(params(url).get("dates")).toBe("20260817T220000/20260818T061500");
  });

  it("falls back to the default hour when the end is not after the start", () => {
    const url = googleCalendarUrl({ title: "Tour", start: "2026-08-17T09:00", end: "2026-08-17T09:00" });
    expect(params(url).get("dates")).toBe("20260817T090000/20260817T100000");
  });

  it("makes a bare date an all-day event, ending the next day", () => {
    const url = googleCalendarUrl({ title: "Museum", start: "2026-08-17" });
    expect(params(url).get("dates")).toBe("20260817/20260818");
  });

  it("spans all-day across a range when only one side has a time", () => {
    const url = googleCalendarUrl({ title: "Hotel Alfonso", start: "2026-08-17T15:00", end: "2026-08-20" });
    expect(params(url).get("dates")).toBe("20260817/20260821");
  });

  it("treats midnight as no time set, the way the booking form writes it", () => {
    const url = googleCalendarUrl({ title: "Check-in", start: "2026-08-17T00:00:00.000Z" });
    expect(params(url).get("dates")).toBe("20260817/20260818");
  });

  it("rolls the month over when the default hour crosses it", () => {
    const url = googleCalendarUrl({ title: "Late", start: "2026-08-31T23:30" });
    expect(params(url).get("dates")).toBe("20260831T233000/20260901T003000");
  });

  it("omits location and details when there are none", () => {
    const url = googleCalendarUrl({ title: "Idea", start: "2026-08-17" });
    expect(url).not.toContain("location=");
    expect(url).not.toContain("details=");
  });

  it("returns null without a date", () => {
    expect(googleCalendarUrl({ title: "Someday", start: null })).toBeNull();
    expect(googleCalendarUrl({ title: "Someday", start: "" })).toBeNull();
    expect(googleCalendarUrl({ title: "Someday", start: "not a date" })).toBeNull();
  });
});

const booking = {
  title: "UA 118",
  type: "flight" as const,
  startAt: "2026-08-17T08:40:00.000Z",
  endAt: null,
  address: null,
  confirmationCode: "ABC123",
  flightNumber: "UA118",
  notes: "Aisle seat",
};

describe("bookingCalendarUrl", () => {
  it("puts the type, flight number, confirmation and notes in the description", () => {
    const details = params(bookingCalendarUrl(booking)).get("details");
    expect(details).toBe("Flight\nFlight UA118\nConfirmation: ABC123\nAisle seat");
  });

  it("prefers the booking's own address, then the linked place", () => {
    const place = { name: "Prado", address: "Calle Ruiz de Alarcón 23" };
    expect(params(bookingCalendarUrl({ ...booking, address: "Terminal 4" }, { linkedPlace: place })).get("location")).toBe(
      "Terminal 4",
    );
    expect(params(bookingCalendarUrl(booking, { linkedPlace: place })).get("location")).toBe("Calle Ruiz de Alarcón 23");
    expect(params(bookingCalendarUrl(booking, { linkedPlace: { name: "Prado", address: null } })).get("location")).toBe(
      "Prado",
    );
  });

  it("returns null for an unscheduled booking", () => {
    expect(bookingCalendarUrl({ ...booking, startAt: null })).toBeNull();
  });
});

describe("itineraryCalendarUrl", () => {
  it("combines the scheduled date with the item's time", () => {
    const url = itineraryCalendarUrl({ title: "Prado", scheduledDate: "2026-08-17", time: "10:00" });
    expect(params(url).get("dates")).toBe("20260817T100000/20260817T110000");
  });

  it("is all-day when the item has no time", () => {
    const url = itineraryCalendarUrl({ title: "Prado", scheduledDate: "2026-08-17", time: null });
    expect(params(url).get("dates")).toBe("20260817/20260818");
  });

  it("returns null until the item is scheduled", () => {
    expect(itineraryCalendarUrl({ title: "Prado", scheduledDate: null, time: "10:00" })).toBeNull();
  });
});

describe("timezones", () => {
  const legs = [
    { id: 1, timezone: "Europe/Madrid", startDate: "2026-08-15", endDate: "2026-08-20" },
    { id: 2, timezone: "Africa/Casablanca", startDate: "2026-08-21", endDate: "2026-08-25" },
    { id: 3, timezone: null, startDate: "2026-08-26", endDate: "2026-08-28" },
  ];

  it("prefers the leg the event is filed under", () => {
    expect(resolveTimezone({ legs }, { legId: 2, date: "2026-08-17" })).toBe("Africa/Casablanca");
  });

  it("falls back to whichever leg covers the date when there is no leg id", () => {
    expect(resolveTimezone({ legs }, { date: "2026-08-17" })).toBe("Europe/Madrid");
    expect(resolveTimezone({ legs }, { date: "2026-08-22" })).toBe("Africa/Casablanca");
  });

  it("falls through a leg that has no zone yet", () => {
    expect(resolveTimezone({ legs, homeTimezone: "America/Chicago" }, { legId: 3, date: "2026-08-27" })).toBe(
      "America/Chicago",
    );
  });

  it("uses home for a date outside every leg, and null when there is no home", () => {
    expect(resolveTimezone({ legs, homeTimezone: "America/Chicago" }, { date: "2026-07-01" })).toBe("America/Chicago");
    expect(resolveTimezone({ legs }, { date: "2026-07-01" })).toBeNull();
    expect(resolveTimezone({}, {})).toBeNull();
  });

  it("attaches ctz to a timed event", () => {
    const url = googleCalendarUrl({ title: "Tour", start: "2026-08-17T10:00", timezone: "Europe/Madrid" });
    expect(params(url).get("ctz")).toBe("Europe/Madrid");
    expect(params(url).get("dates")).toBe("20260817T100000/20260817T110000");
  });

  it("leaves an all-day event floating", () => {
    const url = googleCalendarUrl({ title: "Museum day", start: "2026-08-17", timezone: "Europe/Madrid" });
    expect(params(url).get("ctz")).toBeNull();
  });

  it("keeps a flight floating — its leg's zone is the arrival end, not departure", () => {
    const url = bookingCalendarUrl(booking, { timezone: "Europe/Madrid" });
    expect(params(url).get("ctz")).toBeNull();
  });

  it("zones every other booking type", () => {
    const url = bookingCalendarUrl({ ...booking, type: "restaurant" }, { timezone: "Europe/Madrid" });
    expect(params(url).get("ctz")).toBe("Europe/Madrid");
  });

  it("zones a timed itinerary item", () => {
    const url = itineraryCalendarUrl(
      { title: "Prado", scheduledDate: "2026-08-17", time: "10:00" },
      { timezone: "Europe/Madrid" },
    );
    expect(params(url).get("ctz")).toBe("Europe/Madrid");
  });
});
