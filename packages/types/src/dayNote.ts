import { z } from "zod";

export const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/** A free-form note pinned to one calendar day of a trip. At most one per
 * (trip, date) — see migration 031. */
export const DayNote = z.object({
  tripId: z.number().int(),
  date: z.string(), // "YYYY-MM-DD"
  note: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type DayNote = z.infer<typeof DayNote>;

/** Upsert body for PUT /api/trips/:tripId/day-notes/:date. An empty/whitespace
 * note deletes the row — there's no separate DELETE to call. */
export const SetDayNoteBody = z.object({
  note: z.string().max(2000),
});
export type SetDayNoteBody = z.infer<typeof SetDayNoteBody>;
