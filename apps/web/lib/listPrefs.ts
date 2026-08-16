"use client";

import { useEffect, useState } from "react";

const SHOW_DONE_KEY = "travel:showDoneListIds";

function load(): Set<number> {
  if (typeof window === "undefined") return new Set();
  try {
    const stored = window.localStorage.getItem(SHOW_DONE_KEY);
    return stored ? new Set(JSON.parse(stored) as number[]) : new Set();
  } catch {
    return new Set();
  }
}

/** Per-list "hide completed items" preference, kept client-side only — it's a
 * view setting, not list data, so it never round-trips to the API.
 *
 * Completed items are hidden by default, so what's stored is the opt-*out* set:
 * the lists the user has explicitly asked to keep showing done items.
 *
 * Starts empty (matching SSR) and fills from localStorage after mount, the
 * same hydration-safe shape the collapsed-list preference uses. */
export function useHideDoneLists() {
  const [showDoneListIds, setShowDoneListIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    setShowDoneListIds(load());
  }, []);

  function toggleHideDone(listId: number) {
    setShowDoneListIds((prev) => {
      const next = new Set(prev);
      if (next.has(listId)) next.delete(listId);
      else next.add(listId);
      window.localStorage.setItem(SHOW_DONE_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  return { hidesDone: (listId: number) => !showDoneListIds.has(listId), toggleHideDone };
}
