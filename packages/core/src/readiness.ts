import type { Booking, Leg, Place, Trip } from "@travel/types";
import { pluralCity } from "./tripDates";

/**
 * The "Trip readiness" nudges, as one shared rule set.
 *
 * Web and mobile both computed these inline and had already drifted (mobile was
 * missing the ideas nudge and the tone split). They live here now so a nudge is
 * defined once and — more importantly — so a *dismissal key* means the same
 * thing on both platforms, since the dismissal is stored server-side.
 *
 * Nudges are computed **per subject**, not per message. "3 cities still need
 * dates" is a count over a changing set, so dismissing the message would
 * silently hide a fourth city added later; dismissing `leg:7:dates` hides only
 * Seville and lets the line re-render as "2 cities". Groups exist purely to
 * render the aggregate line from whatever subjects survive the filter.
 */
export type ReadinessRule = "leg-dates" | "leg-lodging" | "place-unscheduled";
export type ReadinessTone = "warning" | "info";

export interface ReadinessNudge {
  /** Stable per-subject id, e.g. "leg:7:dates" — this is what gets stored. */
  key: string;
  rule: ReadinessRule;
  /** The city or place this nudge is about, for the dismissed-list UI. */
  subjectLabel: string;
}

export interface ReadinessGroup {
  rule: ReadinessRule;
  tone: ReadinessTone;
  /** Aggregate line, already reflecting only the undismissed subjects. */
  text: string;
  nudges: ReadinessNudge[];
}

export interface ReadinessInput {
  trip: Pick<Trip, "status">;
  legs: Leg[];
  bookings: Booking[];
  places: Pick<Place, "id" | "name" | "status">[];
}

export interface Readiness {
  /** Non-empty groups, in display order. */
  groups: ReadinessGroup[];
  /** Nudges that apply right now but are hidden — the "N dismissed" footer. */
  dismissed: ReadinessNudge[];
}

export function legDatesKey(legId: number): string {
  return `leg:${legId}:dates`;
}
export function legLodgingKey(legId: number): string {
  return `leg:${legId}:lodging`;
}
export function placeUnscheduledKey(placeId: number): string {
  return `place:${placeId}:unscheduled`;
}

function groupText(rule: ReadinessRule, n: number): string {
  switch (rule) {
    case "leg-dates":
      return `${n} ${pluralCity(n)} still need${n === 1 ? "s" : ""} dates`;
    case "leg-lodging":
      return `${n} ${pluralCity(n)} ${n === 1 ? "has" : "have"} no lodging set`;
    case "place-unscheduled":
      return `${n} idea${n === 1 ? "" : "s"} not yet scheduled onto a day`;
  }
}

/**
 * Every nudge the trip's current data warrants, before dismissals. Exported so
 * a dismissal UI can name a key it isn't currently showing.
 */
export function allReadinessNudges(input: ReadinessInput): ReadinessNudge[] {
  const { trip, legs, bookings, places } = input;
  // Nothing to get ready for once it's over.
  if (trip.status === "past") return [];

  const legsWithHotel = new Set(
    bookings.filter((b) => b.type === "hotel" && b.legId != null).map((b) => b.legId),
  );

  const nudges: ReadinessNudge[] = [];
  // A dreaming trip is undated on purpose — dates aren't a gap yet.
  if (trip.status !== "dreaming") {
    for (const leg of legs) {
      if (!leg.startDate || !leg.endDate)
        nudges.push({ key: legDatesKey(leg.id), rule: "leg-dates", subjectLabel: leg.city });
    }
  }
  for (const leg of legs) {
    if (!legsWithHotel.has(leg.id))
      nudges.push({ key: legLodgingKey(leg.id), rule: "leg-lodging", subjectLabel: leg.city });
  }
  for (const place of places) {
    if (place.status === "idea")
      nudges.push({
        key: placeUnscheduledKey(place.id),
        rule: "place-unscheduled",
        subjectLabel: place.name,
      });
  }
  return nudges;
}

/** One dismissed nudge, named by its subject — the aggregate line it came from
 * ("3 cities...") is meaningless once it's been broken up for the restore list. */
export function readinessNudgeLabel(nudge: ReadinessNudge): string {
  switch (nudge.rule) {
    case "leg-dates":
      return `${nudge.subjectLabel} needs dates`;
    case "leg-lodging":
      return `${nudge.subjectLabel} has no lodging`;
    case "place-unscheduled":
      return `${nudge.subjectLabel} not scheduled`;
  }
}

const RULE_ORDER: ReadinessRule[] = ["leg-dates", "leg-lodging", "place-unscheduled"];
const RULE_TONE: Record<ReadinessRule, ReadinessTone> = {
  "leg-dates": "warning",
  "leg-lodging": "warning",
  "place-unscheduled": "info",
};

/**
 * The nudges to show, grouped into their aggregate lines, plus the ones a
 * dismissal is currently hiding.
 *
 * A dismissal is not expired when its condition flips back (a city that gets
 * lodging and loses it again stays quiet) — deliberately: the alternative needs
 * a per-key snapshot of the field it was dismissed against, and the footer's
 * "N dismissed" + restore is a cheap enough escape hatch.
 */
export function computeReadiness(input: ReadinessInput, dismissedKeys: Iterable<string> = []): Readiness {
  const dismissedSet = new Set(dismissedKeys);
  const all = allReadinessNudges(input);
  const visible = all.filter((n) => !dismissedSet.has(n.key));

  const groups: ReadinessGroup[] = [];
  for (const rule of RULE_ORDER) {
    const nudges = visible.filter((n) => n.rule === rule);
    if (nudges.length === 0) continue;
    groups.push({ rule, tone: RULE_TONE[rule], text: groupText(rule, nudges.length), nudges });
  }
  return { groups, dismissed: all.filter((n) => dismissedSet.has(n.key)) };
}
