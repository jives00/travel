import { useSyncExternalStore } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

const SHOW_DONE_KEY = "travel:showDoneListIds";

/** Per-list "hide completed items" preference. Client-side only — it's a view
 * setting, not list data, so it never round-trips to the API.
 *
 * Completed items are hidden by default, so what's stored is the opt-*out* set:
 * the lists the user has explicitly asked to keep showing done items.
 *
 * Kept in a module-level store rather than component state because several
 * ListCards render at once (Lists screen, trip detail's Lists sheet); each
 * holding its own copy would let a stale write clobber another card's toggle. */
let showDoneIds = new Set<number>();
const listeners = new Set<() => void>();

void AsyncStorage.getItem(SHOW_DONE_KEY).then((stored) => {
  if (!stored) return;
  try {
    showDoneIds = new Set(JSON.parse(stored) as number[]);
    listeners.forEach((l) => l());
  } catch {
    // Corrupt value — fall back to the default of hiding completed items.
  }
});

export function toggleHideDone(listId: number): void {
  const next = new Set(showDoneIds);
  if (next.has(listId)) next.delete(listId);
  else next.add(listId);
  showDoneIds = next;
  void AsyncStorage.setItem(SHOW_DONE_KEY, JSON.stringify([...next]));
  listeners.forEach((l) => l());
}

export function useHideDone(listId: number): boolean {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => listeners.delete(onChange);
    },
    () => !showDoneIds.has(listId),
  );
}
