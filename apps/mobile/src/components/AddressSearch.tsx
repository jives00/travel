import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import type { AutocompleteSuggestion } from "@travel/api-client";
import { travelApi } from "../lib/api";
import { TextField } from "./ui";

/** Non-crypto session token for Places autocomplete billing grouping (Hermes may
 * lack crypto.randomUUID). Uniqueness, not secrecy, is all that's needed. */
function sessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Search an address (Google, via the NAS proxy) and fill a booking's own
 * address/lat/lng directly — no library Place record required. Port of web's
 * booking-fields.tsx LocationSearch, trimmed for touch. */
export function AddressSearch({
  address,
  onPicked,
}: {
  address: string;
  onPicked: (result: { address: string; lat: number; lng: number }) => void;
}) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [picking, setPicking] = useState(false);
  const token = useRef(sessionToken());
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (input.trim().length < 3) {
      setSuggestions([]);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      try {
        setSuggestions(await travelApi.places.autocomplete(input, token.current));
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [input]);

  async function pick(s: AutocompleteSuggestion) {
    setPicking(true);
    try {
      const d = await travelApi.places.autocompleteDetails(s.placeId, token.current);
      onPicked({ address: d.address ?? "", lat: d.lat, lng: d.lng });
      setInput("");
      setSuggestions([]);
      token.current = sessionToken();
    } finally {
      setPicking(false);
    }
  }

  return (
    <View>
      <TextField
        label="Address / meetup location"
        placeholder="Search address…"
        value={input}
        onChangeText={setInput}
        editable={!picking}
      />
      {searching && <ActivityIndicator className="mt-2" />}
      {picking && <Text className="mt-1 text-xs text-text-muted">Loading…</Text>}
      {suggestions.length > 0 &&
        !picking &&
        suggestions.map((s) => (
          <Pressable key={s.placeId} onPress={() => pick(s)} className="border-b border-gridline py-2.5 dark:border-gridline-dark">
            <Text className="text-text-primary dark:text-text-primary-dark">{s.text}</Text>
          </Pressable>
        ))}
      {address ? <Text className="mt-1 text-xs text-text-muted">{address}</Text> : null}
    </View>
  );
}
