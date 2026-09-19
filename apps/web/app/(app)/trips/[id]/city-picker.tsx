"use client";

import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CityCandidate } from "@travel/types";
import { travelApi } from "@/lib/api";

// A city input that makes you say *which* one. Open-Meteo's geocoder ranks by
// population, so taking the top hit for a bare name filed Córdoba under
// Argentina and Toledo under Ohio on a trip through Spain — and a wrong pick is
// invisible until the map, the recap's weather, or a calendar link comes out
// wrong weeks later. So the candidates are shown, with the region and country
// that tell them apart, and the choice travels with the leg (see CityCandidate
// in @travel/types).
//
// Picking is never *required*: submitting a typed name still works and the
// server falls back to the old top-hit guess. The point is to make the right
// answer available, not to block on it.
//
// **The text is the leg's label; the pick is where it is.** Those are not the
// same thing and the picker deliberately doesn't conflate them: "Ronda and
// White Villages" is a day trip, and geocoding that whole string matches
// nothing, which is exactly why that leg has no coordinates at all. So picking
// sets the location and leaves the text alone, and editing the text keeps the
// pick. The consequence — a label that no longer matches its location — is made
// visible rather than guarded against, by always printing the resolved place
// under the field.

export function cityCandidateLabel(c: CityCandidate): string {
  return [c.name, c.admin1, c.country].filter(Boolean).join(", ");
}

export function CityPicker({
  value,
  onChange,
  onPick,
  placeholder = "City…",
  autoFocus,
  className = "",
  inputClassName = "w-full rounded border border-gridline bg-transparent p-2 text-text-primary",
  label,
}: {
  value: string;
  /** Typing — the leg's label. Does not disturb the pick. */
  onChange: (city: string) => void;
  /** A candidate chosen from the list. The parent sends it along as the leg's
   * `geo`. */
  onPick: (candidate: CityCandidate) => void;
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  inputClassName?: string;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  // Debounced copy of `value` — the query key. Typing "Barcelona" would
  // otherwise be nine round trips, eight of them already stale.
  const [term, setTerm] = useState(value);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setTerm(value), 250);
    return () => clearTimeout(t);
  }, [value]);

  // Clicking anywhere else is a dismissal. Without this the list stays open
  // over whatever the user moved on to, and a stray Enter picks a city.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const { data: candidates, isFetching } = useQuery(travelApi.queries.citySearchQuery(term));
  const showList = open && term.trim().length >= 2;

  function pick(c: CityCandidate) {
    onPick(c);
    setOpen(false);
  }

  return (
    <div ref={boxRef} className={`relative ${className}`}>
      <input
        className={inputClassName}
        placeholder={placeholder}
        aria-label={label ?? placeholder}
        autoFocus={autoFocus}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
        autoComplete="off"
      />
      {showList && (
        <ul className="absolute z-20 mt-1 max-h-64 w-full overflow-auto rounded border border-gridline bg-surface shadow-lg">
          {(candidates ?? []).map((c) => (
            <li key={`${c.lat},${c.lng}`}>
              <button
                type="button"
                // mousedown, not click: the input's blur would otherwise close
                // the list before the click landed.
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(c);
                }}
                className="flex w-full flex-col items-start px-3 py-2 text-left hover:bg-page"
              >
                <span className="text-sm text-text-primary">{cityCandidateLabel(c)}</span>
                {c.timezone && <span className="text-xs text-text-muted">{c.timezone}</span>}
              </button>
            </li>
          ))}
          {candidates != null && candidates.length === 0 && !isFetching && (
            <li className="px-3 py-2 text-sm text-text-muted">
              No match — the name is still saved as typed.
            </li>
          )}
          {isFetching && candidates == null && (
            <li className="px-3 py-2 text-sm text-text-muted">Searching…</li>
          )}
        </ul>
      )}
    </div>
  );
}

/** Where the leg actually is, printed under its name. Always rendered once
 * something is known, never only on a mismatch: the label and the location are
 * allowed to differ ("Ronda and White Villages" really is at Ronda), so the
 * only way to tell an intended difference from a forgotten re-pick is to be
 * able to read it. */
export function CityPickNote({
  picked,
  fallback,
}: {
  picked: CityCandidate | null;
  /** What the leg resolved to before this edit, for the edit form. */
  fallback?: { country: string | null; timezone: string | null };
}) {
  if (picked) {
    return (
      <p className="text-xs text-text-muted">
        Location: {cityCandidateLabel(picked)}
        {picked.timezone ? ` · ${picked.timezone}` : ""}
      </p>
    );
  }
  if (!fallback) return null;
  return (
    <p className="text-xs text-text-muted">
      {fallback.country ? `Location: ${fallback.country}` : "Location not resolved yet"}
      {fallback.timezone ? ` · ${fallback.timezone}` : ""} — search above to set it.
    </p>
  );
}
