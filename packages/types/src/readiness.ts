import { z } from "zod";

/** A silenced "Trip readiness" nudge. `key` is the per-subject id built by
 * @travel/core's `computeReadiness` (e.g. "leg:7:dates") — opaque to the API,
 * which only stores and returns it. Keyed per subject rather than per message
 * so a newly-added city still warns. */
export const ReadinessDismissal = z.object({
  tripId: z.number().int(),
  key: z.string(),
  dismissedAt: z.string(),
});
export type ReadinessDismissal = z.infer<typeof ReadinessDismissal>;

/** Body for POST/DELETE /api/trips/:tripId/readiness/dismissals. A list, not a
 * single key: dismissing the "3 cities still need dates" line dismisses all
 * three subjects in one round trip (and one offline mutation). */
export const ReadinessDismissalBody = z.object({
  keys: z.array(z.string().min(1).max(190)).min(1).max(500),
});
export type ReadinessDismissalBody = z.infer<typeof ReadinessDismissalBody>;
