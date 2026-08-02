import { useMutation } from "@tanstack/react-query";
import type { DayNote } from "@travel/types";
import { travelApi } from "../api";
import { queryClient } from "../queryClient";
import { registerOfflineMutation, resolveId } from "../mutations";

export const DAY_NOTE_SET = ["dayNotes", "set"] as const;

export interface SetDayNoteVars {
  tripId: number;
  /** "YYYY-MM-DD" */
  date: string;
  note: string;
}

/** A note the API stores as a DATE column can come back either bare or as a
 * full ISO timestamp depending on the driver path — compare on the day. */
function dayOf(d: string): string {
  return d.length > 10 ? d.slice(0, 10) : d;
}

export function registerDayNoteMutations(): void {
  registerOfflineMutation<SetDayNoteVars, DayNote | void>({
    mutationKey: DAY_NOTE_SET,
    mutationFn: ({ tripId, date, note }) => travelApi.dayNotes.set(tripId, date, { note }),
    // A note written offline on a trip that was itself created offline still
    // carries that trip's temp id — resolve it before the request goes out.
    resolveRefs: (vars) => ({ ...vars, tripId: resolveId(vars.tripId) }),
  });
}

/** Upsert of one day's note. Last-write-wins (single user), and a blank note
 * deletes the row server-side — so the optimistic update drops it locally too,
 * keeping the cache shaped exactly like the response the sync will bring back. */
export function useSetDayNote(tripId: number) {
  const queryKey = ["dayNotes", tripId] as const;
  return useMutation<DayNote | void, Error, SetDayNoteVars>({
    mutationKey: DAY_NOTE_SET,
    onMutate: async (vars) => {
      await queryClient.cancelQueries({ queryKey });
      const prev = queryClient.getQueryData<DayNote[]>(queryKey);
      const list = prev ?? [];
      const existing = list.find((n) => dayOf(n.date) === vars.date);
      const without = list.filter((n) => dayOf(n.date) !== vars.date);
      const now = new Date().toISOString();
      queryClient.setQueryData<DayNote[]>(
        queryKey,
        vars.note.trim()
          ? [
              ...without,
              {
                tripId,
                date: vars.date,
                note: vars.note,
                createdAt: existing?.createdAt ?? now,
                updatedAt: now,
              },
            ].sort((a, b) => dayOf(a.date).localeCompare(dayOf(b.date)))
          : without,
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      const c = ctx as { prev?: DayNote[] } | undefined;
      if (c?.prev) queryClient.setQueryData(queryKey, c.prev);
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey }),
  });
}
