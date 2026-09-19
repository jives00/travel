import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { CityCandidate } from "@travel/types";
import { travelApi } from "../../lib/api";
import { TextField } from "./TextField";

// A city input that makes you say *which* one. Open-Meteo's geocoder ranks by
// population, so taking the top hit for a bare name filed Córdoba under
// Argentina and Toledo under Ohio on a trip through Spain — and a wrong pick is
// invisible until the map, the recap's weather, or a calendar link comes out
// wrong weeks later. Mirrors web's CityPicker; see CityCandidate in
// @travel/types.
//
// Picking is never *required*: submitting a typed name still works and the
// server falls back to the old top-hit guess.
//
// **The text is the leg's label; the pick is where it is.** Picking sets the
// location and leaves the text alone — "Ronda and White Villages" is a day
// trip, and geocoding that whole string matches nothing, which is why that leg
// has no coordinates at all. A label that no longer matches its location is
// made visible rather than guarded against, by always printing the resolved
// place under the field.
//
// The results render inline under the field rather than as an overlay — this
// lives inside a Sheet, and an absolutely-positioned dropdown inside a scroll
// view is a fight not worth having for a list of four cities.

export function cityCandidateLabel(c: CityCandidate): string {
  return [c.name, c.admin1, c.country].filter(Boolean).join(", ");
}

export function CityField({
  value,
  onChange,
  onPick,
  picked,
  label = "City",
  placeholder = "e.g. Barcelona",
  className,
}: {
  value: string;
  /** Typing — the leg's label. Does not disturb the pick. */
  onChange: (city: string) => void;
  onPick: (candidate: CityCandidate) => void;
  picked: CityCandidate | null;
  label?: string;
  placeholder?: string;
  className?: string;
}) {
  // Debounced copy of `value` — the query key. Typing "Barcelona" would
  // otherwise be nine round trips, eight of them already stale.
  const [term, setTerm] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setTerm(value), 250);
    return () => clearTimeout(t);
  }, [value]);

  // Opened by focus and closed by a pick — never by blur. Pressing a row blurs
  // the input first, so hiding on blur would unmount the row before its
  // onPress ever fired.
  const [open, setOpen] = useState(false);

  const { data: candidates, isFetching } = useQuery(travelApi.queries.citySearchQuery(term));
  const showList = open && term.trim().length >= 2;

  return (
    <View className={className}>
      <TextField
        label={label}
        value={value}
        placeholder={placeholder}
        autoCapitalize="words"
        autoCorrect={false}
        onChangeText={(text) => {
          onChange(text);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
      />

      {picked && (
        <Text className="mt-1 text-xs text-text-muted">
          Location: {cityCandidateLabel(picked)}
          {picked.timezone ? ` · ${picked.timezone}` : ""}
        </Text>
      )}

      {showList && (
        <View className="mt-1 overflow-hidden rounded border border-gridline dark:border-gridline-dark">
          {(candidates ?? []).map((c) => (
            <Pressable
              key={`${c.lat},${c.lng}`}
              accessibilityRole="button"
              className="border-b border-gridline px-3 py-2 last:border-b-0 dark:border-gridline-dark"
              onPress={() => {
                onPick(c);
                setOpen(false);
              }}
            >
              <Text className="text-sm text-text-primary dark:text-text-primary-dark">
                {cityCandidateLabel(c)}
              </Text>
              {c.timezone ? <Text className="text-xs text-text-muted">{c.timezone}</Text> : null}
            </Pressable>
          ))}
          {candidates != null && candidates.length === 0 && !isFetching && (
            <Text className="px-3 py-2 text-sm text-text-muted">
              No match — the name is still saved as typed.
            </Text>
          )}
          {isFetching && candidates == null && (
            <Text className="px-3 py-2 text-sm text-text-muted">Searching…</Text>
          )}
        </View>
      )}
    </View>
  );
}
