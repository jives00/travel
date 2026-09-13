import { useEffect, useState } from "react";
import { View, Text, Image, Pressable, RefreshControl, ScrollView, Share } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useQuery } from "@tanstack/react-query";
import type { Trip } from "@travel/types";
import {
  computeCountdown,
  buildShareItineraryText,
  computeReadiness,
  readinessNudgeLabel,
  todayUtcMidnight,
} from "@travel/core";
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
import { useDismissReadiness, useRestoreReadiness } from "../lib/offlineMutations/readiness";
import { Card, Button, SegmentedControl, TextField, Sheet, DateField, STATUS_BAR_BG } from "./ui";
import { TripWeather } from "./TripWeather";
import { TripItinerary } from "./TripItinerary";
import { TripMap } from "./TripMap";
import { SyncBanner } from "./SyncBanner";
import { ListCard } from "./ListCard";

/** The shared trip-detail body — rendered by both the Trips stack's detail screen
 * and the Home tab (Home just resolves the active/primary trip and renders this).
 * Mirrors web's trip-detail.tsx: hero + countdown, readiness nudges, edit sheet,
 * weather. Itinerary and the trip map are embedded in later phases (D/E). */
// Budget lives in both the Home and Trips stacks under this screen name, so a
// minimal param-list shape is all this navigate call needs.
type BudgetNav = NativeStackNavigationProp<{ TripBudget: { tripId: number } }>;

const COLLAPSED_LISTS_KEY = "travel:collapsedListIds";

export function TripDetailView({ tripId, onArchived }: { tripId: number; onArchived?: () => void }) {
  const navigation = useNavigation<BudgetNav>();
  const { data: trip } = useQuery(travelApi.queries.tripQuery(tripId));
  const { data: bookings } = useQuery(travelApi.queries.bookingsQuery(tripId));
  const { data: allLists } = useQuery(travelApi.queries.listsQuery(tripId));
  // Both already cached by the embedded itinerary/map sections — read here so
  // the Share button can build its text without extra fetches.
  const { data: itineraryItems } = useQuery(travelApi.queries.itineraryQuery(tripId));
  const { data: tripPlaces } = useQuery(travelApi.queries.placesQuery({ tripId }));
  const { data: dismissals } = useQuery(travelApi.queries.readinessDismissalsQuery(tripId));
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

  const [nameDraft, setNameDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [backdropDraft, setBackdropDraft] = useState("");
  const [addingCity, setAddingCity] = useState(false);
  const [cityName, setCityName] = useState("");
  const [cityStart, setCityStart] = useState("");
  const [cityEnd, setCityEnd] = useState("");
  const [showingLists, setShowingLists] = useState(false);
  const [showDismissed, setShowDismissed] = useState(false);
  const dismissReadiness = useDismissReadiness(tripId);
  const restoreReadiness = useRestoreReadiness(tripId);
  const [collapsedListIds, setCollapsedListIds] = useState<Set<number>>(new Set());
  useEffect(() => {
    void AsyncStorage.getItem(COLLAPSED_LISTS_KEY).then((stored) => {
      if (stored) setCollapsedListIds(new Set(JSON.parse(stored) as number[]));
    });
  }, []);

  function toggleListCollapsed(listId: number) {
    setCollapsedListIds((prev) => {
      const next = new Set(prev);
      if (next.has(listId)) next.delete(listId);
      else next.add(listId);
      void AsyncStorage.setItem(COLLAPSED_LISTS_KEY, JSON.stringify([...next]));
      return next;
    });
  }

  const insets = useSafeAreaInsets();
  const { refreshing, onRefresh } = usePullToRefresh();

  if (!trip) return null;

  const sortedLegs = [...trip.legs].sort((a, b) => a.sortOrder - b.sortOrder);
  const today = todayUtcMidnight();
  const countdown = computeCountdown(trip, sortedLegs, bookings ?? [], today);
  const cityChain = sortedLegs.map((l) => l.city).join(" → ");
  const heroUri = trip.heroImageUrl ?? hero?.url ?? null;

  // Readiness nudges — literally the same rules as web now (@travel/core),
  // rather than a hand-copied approximation that had drifted.
  const readiness = computeReadiness(
    { trip, legs: sortedLegs, bookings: bookings ?? [], places: tripPlaces ?? [] },
    (dismissals ?? []).map((d) => d.key),
  );
  const linkedLists = (allLists ?? []).filter((l) => l.tripId === tripId);

  /** Hands the plain-text itinerary (places by city — no dates, logistics
   * bookings, or private items) to the OS share sheet, which is the mobile
   * equivalent of web's copy-to-clipboard modal and gets "Copy" for free. */
  // Read out here, not inside the closure — TS drops the `if (!trip) return`
  // narrowing across a function boundary.
  const tripName = trip.name;
  async function shareItinerary() {
    const message = buildShareItineraryText({
      tripName,
      legs: sortedLegs,
      items: itineraryItems ?? [],
      places: tripPlaces ?? [],
      bookings: bookings ?? [],
    });
    try {
      await Share.share({ message });
    } catch {
      // User dismissed the sheet, or no share target is available — nothing to
      // recover from, and an error toast here would just be noise.
    }
  }

  function saveName() {
    const v = nameDraft.trim();
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
        <View className="absolute inset-0 justify-end p-4">
          <View>
            <Text className="text-2xl font-bold text-white">
              {trip.isPrimary ? "★ " : ""}
              {trip.name}
            </Text>
            {cityChain ? <Text className="text-sm text-white/80">{cityChain}</Text> : null}
            <Text className="mt-1 text-xl font-bold text-white">{countdown.headline}</Text>
            <Text className="text-xs text-white/80">{countdown.subline}</Text>
          </View>
        </View>
      </View>

      <View className="p-4">
        {(readiness.groups.length > 0 || readiness.dismissed.length > 0) && (
          <Card className="mb-4">
            <Text className="mb-2 text-xs font-semibold uppercase text-text-muted">Trip readiness</Text>
            {readiness.groups.length === 0 ? (
              <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">Nothing outstanding.</Text>
            ) : (
              readiness.groups.map((g) => (
                <View key={g.rule} className="flex-row items-center justify-between py-0.5">
                  <Text
                    className={`flex-1 text-sm ${g.tone === "warning" ? "text-status-warning" : "text-text-secondary dark:text-text-secondary-dark"}`}
                  >
                    {g.text}
                  </Text>
                  {/* Dismisses the subjects behind the line as it stands now;
                      a city added later is a new key and warns again. */}
                  <Pressable
                    onPress={() => dismissReadiness.mutate({ tripId, keys: g.nudges.map((n) => n.key) })}
                    hitSlop={12}
                    accessibilityLabel={`Dismiss ${g.text}`}
                    className="pl-3"
                  >
                    <Text className="text-base text-text-muted dark:text-text-muted-dark">✕</Text>
                  </Pressable>
                </View>
              ))
            )}
            {readiness.dismissed.length > 0 && (
              <View className="mt-2 border-t border-gridline pt-2 dark:border-gridline-dark">
                <Pressable onPress={() => setShowDismissed((v) => !v)} hitSlop={8}>
                  <Text className="text-xs text-text-muted dark:text-text-muted-dark">
                    {readiness.dismissed.length} dismissed — {showDismissed ? "hide" : "show"}
                  </Text>
                </Pressable>
                {showDismissed &&
                  readiness.dismissed.map((n) => (
                    <View key={n.key} className="flex-row items-center justify-between py-0.5">
                      <Text className="flex-1 text-xs text-text-muted line-through dark:text-text-muted-dark">
                        {readinessNudgeLabel(n)}
                      </Text>
                      <Pressable
                        onPress={() => restoreReadiness.mutate({ tripId, keys: [n.key] })}
                        hitSlop={12}
                        className="pl-3"
                      >
                        <Text className="text-xs text-text-secondary dark:text-text-secondary-dark">Restore</Text>
                      </Pressable>
                    </View>
                  ))}
              </View>
            )}
          </Card>
        )}

        <TripWeather tripId={tripId} />

        <Text className="mb-2 text-xs font-semibold uppercase text-text-muted">Itinerary</Text>
        <TripItinerary tripId={tripId} legs={sortedLegs} />

        {/* Wraps 2-up rather than sharing one row: with Share added there are up
            to four buttons, and at flex-1 on a narrow phone "Edit Trip" and
            "Trip Budget" both wrap to two lines. */}
        <View className="mt-2 flex-row flex-wrap gap-2">
          <Button
            className="w-[48%]"
            variant="secondary"
            title="Edit Trip"
            onPress={() => {
              setNameDraft(trip.name);
              setEditing(true);
            }}
          />
          <Button className="w-[48%]" variant="secondary" title="Share" onPress={shareItinerary} />
          <Button
            className="w-[48%]"
            variant="secondary"
            title="Trip Budget"
            onPress={() => navigation.navigate("TripBudget", { tripId })}
          />
          {linkedLists.length > 0 && (
            <Button className="w-[48%]" variant="secondary" title="Lists" onPress={() => setShowingLists(true)} />
          )}
        </View>

        <Text className="mb-2 mt-4 text-xs font-semibold uppercase text-text-muted">Map</Text>
        <TripMap tripId={tripId} />
      </View>

      {/* Edit sheet */}
      <Sheet visible={editing} onClose={() => setEditing(false)}>
        <Text className="mb-3 text-lg font-semibold text-text-primary dark:text-text-primary-dark">Edit trip</Text>

        <Text className="mb-1 text-sm text-text-secondary dark:text-text-secondary-dark">Name</Text>
        <View className="mb-4 flex-row gap-2">
          <TextField className="flex-1" value={nameDraft} onChangeText={setNameDraft} onSubmitEditing={saveName} />
          <Button title="Save" onPress={saveName} disabled={!nameDraft.trim() || nameDraft.trim() === trip.name} />
        </View>

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
          <DateField className="flex-1" label="Start date" value={cityStart} onChange={setCityStart} />
          <DateField className="flex-1" label="End date" value={cityEnd} onChange={setCityEnd} />
        </View>
        <Button
          title="Add city"
          loading={addLeg.isPending}
          disabled={!cityName.trim()}
          onPress={() => {
            // The pickers only ever produce a valid "YYYY-MM-DD" or "", so the
            // shape guard this used to carry (which silently dropped a typo)
            // is gone.
            addLeg.add({
              city: cityName.trim(),
              startDate: cityStart || undefined,
              endDate: cityEnd || undefined,
            });
            setCityName("");
            setCityStart("");
            setCityEnd("");
            setAddingCity(false);
          }}
        />
      </Sheet>

      {/* Linked lists — read/edit-in-place, but not reorderable here since the
          Sheet already owns the scroll view (see ListCard's `reorderable` note). */}
      <Sheet visible={showingLists} onClose={() => setShowingLists(false)}>
        <Text className="mb-3 text-lg font-semibold text-text-primary dark:text-text-primary-dark">Lists</Text>
        {linkedLists.map((list) => (
          <ListCard
            key={list.id}
            list={list}
            reorderable={false}
            collapsed={collapsedListIds.has(list.id)}
            onToggleCollapsed={() => toggleListCollapsed(list.id)}
          />
        ))}
      </Sheet>
      </ScrollView>
    </View>
  );
}
