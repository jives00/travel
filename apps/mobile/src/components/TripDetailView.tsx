import { useState } from "react";
import { View, Text, Image, Pressable, RefreshControl, ScrollView } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import type { Booking, Trip } from "@travel/types";
import { computeCountdown } from "@travel/core";
import { travelApi } from "../lib/api";
import { usePullToRefresh } from "../lib/usePullToRefresh";
import {
  useUpdateTrip,
  useSetPrimary,
  useClearPrimary,
  useArchiveTrip,
  useAddLeg,
  useDeleteLeg,
} from "../lib/offlineMutations/trips";
import { Card, Button, SegmentedControl, TextField, Sheet, STATUS_BAR_BG } from "./ui";
import { TripWeather } from "./TripWeather";
import { TripItinerary } from "./TripItinerary";
import { TripMap } from "./TripMap";
import { SyncBanner } from "./SyncBanner";

/** The shared trip-detail body — rendered by both the Trips stack's detail screen
 * and the Home tab (Home just resolves the active/primary trip and renders this).
 * Mirrors web's trip-detail.tsx: hero + countdown, readiness nudges, edit sheet,
 * weather. Itinerary and the trip map are embedded in later phases (D/E). */
// Budget lives in both the Home and Trips stacks under this screen name, so a
// minimal param-list shape is all this navigate call needs.
type BudgetNav = NativeStackNavigationProp<{ TripBudget: { tripId: number } }>;

export function TripDetailView({ tripId, onArchived }: { tripId: number; onArchived?: () => void }) {
  const navigation = useNavigation<BudgetNav>();
  const { data: trip } = useQuery(travelApi.queries.tripQuery(tripId));
  const { data: bookings } = useQuery(travelApi.queries.bookingsQuery(tripId));
  const { data: hero } = useQuery({
    ...travelApi.queries.heroImageQuery(tripId),
    enabled: !trip?.heroImageUrl,
  });

  const updateTrip = useUpdateTrip();
  const setPrimary = useSetPrimary();
  const clearPrimary = useClearPrimary();
  const archiveTrip = useArchiveTrip();
  const addLeg = useAddLeg(tripId);
  const deleteLeg = useDeleteLeg(tripId);

  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [backdropDraft, setBackdropDraft] = useState("");
  const [addingCity, setAddingCity] = useState(false);
  const [cityName, setCityName] = useState("");
  const [cityStart, setCityStart] = useState("");
  const [cityEnd, setCityEnd] = useState("");

  const insets = useSafeAreaInsets();
  const { refreshing, onRefresh } = usePullToRefresh();

  if (!trip) return null;

  const sortedLegs = [...trip.legs].sort((a, b) => a.sortOrder - b.sortOrder);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const countdown = computeCountdown(trip, sortedLegs, bookings ?? [], today);
  const cityChain = sortedLegs.map((l) => l.city).join(" → ");
  const heroUri = trip.heroImageUrl ?? hero?.url ?? null;

  // Readiness nudges — same rules as web.
  const hotelLegIds = new Set(
    (bookings ?? []).filter((b: Booking) => b.type === "hotel" && b.legId != null).map((b) => b.legId),
  );
  const legsNoDates = sortedLegs.filter((l) => !l.startDate || !l.endDate);
  const legsNoLodging = sortedLegs.filter((l) => !hotelLegIds.has(l.id));
  const nudges: string[] = [];
  if (trip.status !== "dreaming" && legsNoDates.length > 0) nudges.push(`${legsNoDates.length} city(ies) still need dates`);
  if (sortedLegs.length > 0 && legsNoLodging.length > 0) nudges.push(`${legsNoLodging.length} city(ies) have no lodging set`);

  function saveName() {
    const v = nameDraft.trim();
    setEditingName(false);
    if (v && v !== trip!.name) updateTrip.mutate({ id: tripId, body: { name: v } });
  }

  return (
    <View className="flex-1 bg-page dark:bg-page-dark">
      <View style={{ height: insets.top, backgroundColor: STATUS_BAR_BG }} />
      <SyncBanner />
      <ScrollView className="flex-1" refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}>
      {/* Hero */}
      <View className="relative h-56 w-full bg-category-lodging">
        {heroUri ? <Image source={{ uri: heroUri }} className="h-full w-full" resizeMode="cover" /> : null}
        {/* Fade behind the text — stacked bands simulate a gradient without a native module. */}
        <View className="absolute inset-x-0 bottom-0 h-32 flex-col justify-end">
          <View className="h-6 bg-black/10" />
          <View className="h-6 bg-black/20" />
          <View className="h-6 bg-black/35" />
          <View className="h-6 bg-black/45" />
          <View className="h-8 bg-black/55" />
        </View>
        <View className="absolute inset-0 justify-between p-4">
          <View className="flex-row justify-end">
            <Pressable onPress={() => setEditing(true)} className="rounded bg-black/40 px-2 py-1">
              <Text className="text-xs text-white">Edit</Text>
            </Pressable>
          </View>
          <View>
            {editingName ? (
              <View className="flex-row items-center gap-2">
                <TextField
                  className="flex-1"
                  autoFocus
                  value={nameDraft}
                  onChangeText={setNameDraft}
                  onSubmitEditing={saveName}
                />
                <Button title="Save" onPress={saveName} />
              </View>
            ) : (
              <Pressable
                onPress={() => {
                  setNameDraft(trip.name);
                  setEditingName(true);
                }}
              >
                <Text className="text-2xl font-bold text-white">
                  {trip.isPrimary ? "★ " : ""}
                  {trip.name}
                </Text>
              </Pressable>
            )}
            {cityChain ? <Text className="text-sm text-white/80">{cityChain}</Text> : null}
            <Text className="mt-1 text-xl font-bold text-white">{countdown.headline}</Text>
            <Text className="text-xs text-white/80">{countdown.subline}</Text>
          </View>
        </View>
      </View>

      <View className="p-4">
        {trip.status !== "past" && nudges.length > 0 && (
          <Card className="mb-4">
            <Text className="mb-2 text-xs font-semibold uppercase text-text-muted">Trip readiness</Text>
            {nudges.map((n) => (
              <Text key={n} className="text-sm text-status-warning">
                {n}
              </Text>
            ))}
          </Card>
        )}

        <Pressable onPress={() => navigation.navigate("TripBudget", { tripId })}>
          <Card className="mb-4 flex-row items-center justify-between">
            <Text className="font-medium text-text-primary dark:text-text-primary-dark">Budget</Text>
            <Text className="text-text-muted">›</Text>
          </Card>
        </Pressable>

        <TripWeather tripId={tripId} />

        <Text className="mb-2 text-xs font-semibold uppercase text-text-muted">Itinerary</Text>
        <TripItinerary tripId={tripId} legs={sortedLegs} />

        <Text className="mb-2 mt-4 text-xs font-semibold uppercase text-text-muted">Map</Text>
        <TripMap tripId={tripId} />
      </View>

      {/* Edit sheet */}
      <Sheet visible={editing} onClose={() => setEditing(false)}>
        <Text className="mb-3 text-lg font-semibold text-text-primary dark:text-text-primary-dark">Edit trip</Text>

        <Text className="mb-1 text-sm text-text-secondary dark:text-text-secondary-dark">Status</Text>
        <SegmentedControl
          className="mb-4"
          value={trip.statusOverride ?? "auto"}
          onChange={(v) =>
            updateTrip.mutate({ id: tripId, body: { statusOverride: v === "auto" ? null : (v as Trip["statusOverride"]) } })
          }
          segments={[
            { value: "auto", label: `Auto (${trip.status})` },
            { value: "dreaming", label: "Dreaming" },
            { value: "planned", label: "Planned" },
            { value: "active", label: "Active" },
            { value: "past", label: "Past" },
          ]}
        />

        <Text className="mb-1 text-sm text-text-secondary dark:text-text-secondary-dark">Backdrop image URL</Text>
        <View className="mb-4 flex-row gap-2">
          <TextField
            className="flex-1"
            placeholder="https://…"
            value={backdropDraft}
            onChangeText={setBackdropDraft}
          />
          <Button
            title="Set"
            variant="secondary"
            onPress={() => {
              const v = backdropDraft.trim();
              updateTrip.mutate({ id: tripId, body: { heroImageUrl: v || null } });
              setBackdropDraft("");
            }}
          />
        </View>

        <View className="mb-4">
          <View className="mb-2 flex-row items-center justify-between">
            <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">Cities</Text>
            <Pressable onPress={() => setAddingCity(true)}>
              <Text className="text-sm text-category-transit">+ Add city</Text>
            </Pressable>
          </View>
          {sortedLegs.length === 0 ? (
            <Text className="text-sm text-text-muted">No cities yet.</Text>
          ) : (
            sortedLegs.map((leg) => (
              <Card key={leg.id} className="mb-2 flex-row items-center justify-between">
                <View>
                  <Text className="font-medium text-text-primary dark:text-text-primary-dark">{leg.city}</Text>
                  <Text className="text-xs text-text-muted">
                    {leg.startDate && leg.endDate ? `${leg.startDate} – ${leg.endDate}` : "Dates not set"}
                  </Text>
                </View>
                <Pressable onPress={() => deleteLeg.mutate({ legId: leg.id })} className="px-2">
                  <Text className="text-text-muted">✕</Text>
                </Pressable>
              </Card>
            ))
          )}
        </View>

        <Button
          className="mb-2"
          variant="secondary"
          title={trip.isPrimary ? "★ Remove as Home trip" : "☆ Set as Home trip"}
          onPress={() => (trip.isPrimary ? clearPrimary.mutate({ id: tripId }) : setPrimary.mutate({ id: tripId }))}
        />
        <Button
          className="mb-2"
          variant="danger"
          title="Archive trip"
          onPress={() => {
            archiveTrip.mutate({ id: tripId });
            setEditing(false);
            onArchived?.();
          }}
        />
        <Button variant="ghost" title="Close" onPress={() => setEditing(false)} />
      </Sheet>

      {/* Add city */}
      <Sheet visible={addingCity} onClose={() => setAddingCity(false)}>
        <Text className="mb-3 text-lg font-semibold text-text-primary dark:text-text-primary-dark">Add city</Text>
        <TextField className="mb-3" label="City" value={cityName} onChangeText={setCityName} placeholder="e.g. Barcelona" />
        <View className="mb-4 flex-row gap-2">
          <TextField className="flex-1" label="Start date" value={cityStart} onChangeText={setCityStart} placeholder="YYYY-MM-DD" />
          <TextField className="flex-1" label="End date" value={cityEnd} onChangeText={setCityEnd} placeholder="YYYY-MM-DD" />
        </View>
        <Button
          title="Add city"
          loading={addLeg.isPending}
          disabled={!cityName.trim()}
          onPress={() => {
            const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s.trim());
            addLeg.add({
              city: cityName.trim(),
              startDate: isDate(cityStart) ? cityStart.trim() : undefined,
              endDate: isDate(cityEnd) ? cityEnd.trim() : undefined,
            });
            setCityName("");
            setCityStart("");
            setCityEnd("");
            setAddingCity(false);
          }}
        />
      </Sheet>
      </ScrollView>
    </View>
  );
}
