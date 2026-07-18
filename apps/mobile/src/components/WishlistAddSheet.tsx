import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ActivityIndicator } from "react-native";
import type { AutocompleteSuggestion } from "@travel/api-client";
import type { WishlistLocationType, WishlistStatus } from "@travel/types";
import { useCreateWishlist } from "../lib/offlineMutations/wishlist";
import { TextField, Button, SegmentedControl, Sheet } from "./ui";

function sessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** Add a wishlist city/country to the world map (search is online-only, via the
 * NAS Places proxy). Mirrors web's WishlistAddForm. */
export function WishlistAddSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const create = useCreateWishlist();
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<{ name: string; lat: number; lng: number } | null>(null);
  const [type, setType] = useState<WishlistLocationType>("city");
  const [status, setStatus] = useState<WishlistStatus>("want_to_visit");
  const [note, setNote] = useState("");
  const token = useRef(sessionToken());
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (input.trim().length < 3) return setSuggestions([]);
    setSearching(true);
    debounce.current = setTimeout(async () => {
      const { travelApi } = await import("../lib/api");
      try {
        setSuggestions(await travelApi.places.autocomplete(input, token.current));
      } catch {
        setSuggestions([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }, [input]);

  async function pick(s: AutocompleteSuggestion) {
    const { travelApi } = await import("../lib/api");
    const d = await travelApi.places.autocompleteDetails(s.placeId, token.current);
    setPicked({ name: d.name, lat: d.lat, lng: d.lng });
    setType(d.googleTypes?.includes("country") ? "country" : "city");
    setInput("");
    setSuggestions([]);
    token.current = sessionToken();
  }

  function reset() {
    setPicked(null);
    setInput("");
    setNote("");
    setStatus("want_to_visit");
    setSuggestions([]);
  }

  function save() {
    if (!picked) return;
    create.create({ name: picked.name, type, status, lat: picked.lat, lng: picked.lng, note: note || undefined });
    reset();
    onClose();
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text className="mb-3 text-lg font-semibold text-text-primary dark:text-text-primary-dark">Add location</Text>
      {!picked ? (
        <>
          <TextField autoFocus placeholder="Search a city or country…" value={input} onChangeText={setInput} />
          {searching ? <ActivityIndicator className="mt-2" /> : null}
          {suggestions.map((s) => (
            <Pressable key={s.placeId} onPress={() => pick(s)} className="border-b border-gridline py-2.5 dark:border-gridline-dark">
              <Text className="text-text-primary dark:text-text-primary-dark">{s.text}</Text>
            </Pressable>
          ))}
        </>
      ) : (
        <>
          <Text className="mb-2 font-medium text-text-primary dark:text-text-primary-dark">{picked.name}</Text>
          <SegmentedControl
            className="mb-2"
            segments={[
              { value: "city", label: "City" },
              { value: "country", label: "Country" },
            ]}
            value={type}
            onChange={setType}
          />
          <SegmentedControl
            className="mb-2"
            segments={[
              { value: "want_to_visit", label: "Want to visit" },
              { value: "visited", label: "Visited" },
            ]}
            value={status}
            onChange={setStatus}
          />
          <TextField className="mb-3" placeholder="Note (optional)" value={note} onChangeText={setNote} />
          <View className="flex-row gap-2">
            <Button title="Add pin" onPress={save} loading={create.isPending} />
            <Button title="Cancel" variant="ghost" onPress={reset} />
          </View>
        </>
      )}
    </Sheet>
  );
}
