import { useEffect, useRef, useState } from "react";
import { View, Text, Pressable, ScrollView, ActivityIndicator } from "react-native";
import { useMutation } from "@tanstack/react-query";
import type { AutocompleteSuggestion, PlaceDetails } from "@travel/api-client";
import type { CreatePlaceBody, Place, PlaceDuplicateMatch, PlaceTag } from "@travel/types";
import { PLACE_TAGS, suggestPrimaryTagFromGoogleTypes } from "@travel/core";
import { travelApi } from "../lib/api";
import { queryClient } from "../lib/queryClient";
import { nextTempId } from "../lib/mutations";
import { PLACE_CREATE } from "../lib/offlineMutations/places";
import { Card, TextField, Button } from "./ui";

/** Non-crypto session token for Places autocomplete billing grouping (Hermes may
 * lack crypto.randomUUID). Uniqueness, not secrecy, is all that's needed. */
function sessionToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

type CreateResult = Place | PlaceDuplicateMatch;

/**
 * Search a place (Google, via the NAS proxy) → preview → pick a tag → save into
 * the library. Manual-entry mode (name + coords) is the offline path, since live
 * search needs the NAS. Port of web's autocomplete-search.tsx, trimmed for touch.
 */
export function AutocompleteSearch({
  tripId,
  onCreated,
  onCancel,
}: {
  tripId?: number;
  onCreated?: (place: Place) => void;
  onCancel?: () => void;
}) {
  const [input, setInput] = useState("");
  const [suggestions, setSuggestions] = useState<AutocompleteSuggestion[]>([]);
  const [searching, setSearching] = useState(false);
  const [manual, setManual] = useState(false);

  // Preview / draft state after a pick (or in manual mode).
  const [details, setDetails] = useState<PlaceDetails | null>(null);
  const [name, setName] = useState("");
  const [tag, setTag] = useState<PlaceTag | "">("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [address, setAddress] = useState("");

  const token = useRef(sessionToken());
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    if (input.trim().length < 3 || manual) {
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
  }, [input, manual]);

  const create = useMutation<CreateResult, Error, CreatePlaceBody & { tempId: number }>({
    mutationKey: PLACE_CREATE,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["places"] });
      const place = (result as PlaceDuplicateMatch).duplicate ? (result as PlaceDuplicateMatch).existing : (result as Place);
      onCreated?.(place);
      reset();
    },
  });

  function reset() {
    setDetails(null);
    setInput("");
    setName("");
    setTag("");
    setLat("");
    setLng("");
    setAddress("");
    setSuggestions([]);
    setManual(false);
    token.current = sessionToken();
  }

  async function pick(s: AutocompleteSuggestion) {
    try {
      const d = await travelApi.places.autocompleteDetails(s.placeId, token.current);
      setDetails(d);
      setName(d.name);
      setAddress(d.address ?? "");
      setLat(String(d.lat));
      setLng(String(d.lng));
      const suggested = suggestPrimaryTagFromGoogleTypes(d.googleTypes);
      setTag((suggested as PlaceTag) ?? "");
      setSuggestions([]);
      setInput("");
    } catch {
      /* ignore — user can retry or switch to manual */
    }
  }

  function save() {
    if (!name.trim() || !tag) return;
    const latN = Number(lat);
    const lngN = Number(lng);
    if (Number.isNaN(latN) || Number.isNaN(lngN)) return;
    create.mutate({
      tempId: nextTempId(),
      googlePlaceId: details?.placeId,
      name: name.trim(),
      primaryTag: tag,
      address: address || undefined,
      lat: latN,
      lng: lngN,
      heroPhotoUrl: details?.heroPhotoUrl ?? undefined,
      description: details?.description ?? undefined,
      rating: details?.rating ?? undefined,
      userRatingsTotal: details?.userRatingsTotal ?? undefined,
      website: details?.website ?? undefined,
      googleTypes: details?.googleTypes ?? undefined,
      hours: details?.hours ?? undefined,
      tripId,
    });
  }

  const inPreview = details != null || manual;

  return (
    <Card>
      {!inPreview ? (
        <>
          <TextField
            label="Search a place"
            autoFocus
            placeholder="e.g. Sagrada Família"
            value={input}
            onChangeText={setInput}
          />
          {searching ? <ActivityIndicator className="mt-2" /> : null}
          {suggestions.map((s) => (
            <Pressable key={s.placeId} onPress={() => pick(s)} className="border-b border-gridline py-2.5 dark:border-gridline-dark">
              <Text className="text-text-primary dark:text-text-primary-dark">{s.text}</Text>
            </Pressable>
          ))}
          <View className="mt-3 flex-row justify-between">
            <Pressable onPress={() => setManual(true)}>
              <Text className="text-sm text-category-transit">Enter manually (works offline)</Text>
            </Pressable>
            {onCancel ? (
              <Pressable onPress={onCancel}>
                <Text className="text-sm text-text-muted">Cancel</Text>
              </Pressable>
            ) : null}
          </View>
        </>
      ) : (
        <>
          <TextField label="Name" value={name} onChangeText={setName} />
          <Text className="mb-1 mt-3 text-sm text-text-secondary dark:text-text-secondary-dark">Type</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-3">
            <View className="flex-row gap-1.5">
              {PLACE_TAGS.map((t) => (
                <Pressable
                  key={t.key}
                  onPress={() => setTag(t.key as PlaceTag)}
                  className={`rounded-full px-3 py-1.5 ${
                    tag === t.key ? "bg-category-transit" : "bg-surface dark:bg-surface-dark"
                  }`}
                >
                  <Text className={`text-xs ${tag === t.key ? "text-white" : "text-text-secondary dark:text-text-secondary-dark"}`}>
                    {t.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          {manual && (
            <View className="mb-3 flex-row gap-2">
              <TextField className="flex-1" label="Lat" keyboardType="numbers-and-punctuation" value={lat} onChangeText={setLat} />
              <TextField className="flex-1" label="Lng" keyboardType="numbers-and-punctuation" value={lng} onChangeText={setLng} />
            </View>
          )}
          <View className="flex-row gap-2">
            <Button title="Add place" onPress={save} loading={create.isPending} disabled={!name.trim() || !tag} />
            <Button title="Cancel" variant="ghost" onPress={reset} />
          </View>
        </>
      )}
    </Card>
  );
}
