import type { ReadinessDismissal } from "@travel/types";
import type { createApiClient } from "../client";

type RequestFn = ReturnType<typeof createApiClient>["request"];

/** Dismissed readiness nudges. Both writes take a list and are idempotent, so
 * dismissing a whole aggregate line (or replaying a queued offline mutation) is
 * a single safe call. Each returns the trip's full dismissal list. */
export function createReadinessEndpoints(request: RequestFn) {
  return {
    listDismissals: (tripId: number) =>
      request<ReadinessDismissal[]>(`/api/trips/${tripId}/readiness/dismissals`),
    dismiss: (tripId: number, keys: string[]) =>
      request<ReadinessDismissal[]>(`/api/trips/${tripId}/readiness/dismissals`, {
        method: "POST",
        body: { keys },
      }),
    restore: (tripId: number, keys: string[]) =>
      request<ReadinessDismissal[]>(`/api/trips/${tripId}/readiness/dismissals`, {
        method: "DELETE",
        body: { keys },
      }),
  };
}
