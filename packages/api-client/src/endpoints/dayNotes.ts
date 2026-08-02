import type { DayNote, SetDayNoteBody } from "@travel/types";
import type { createApiClient } from "../client";

type RequestFn = ReturnType<typeof createApiClient>["request"];

export function createDayNotesEndpoints(request: RequestFn) {
  return {
    list: (tripId: number) => request<DayNote[]>(`/api/trips/${tripId}/day-notes`),
    /** Upsert, keyed on the date. A blank note clears the day and resolves to
     * void (the route replies 204) — there's no separate delete. */
    set: (tripId: number, date: string, body: SetDayNoteBody) =>
      request<DayNote | void>(`/api/trips/${tripId}/day-notes/${date}`, { method: "PUT", body }),
  };
}
