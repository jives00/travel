import { View, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { Trip } from "@travel/types";
import {
  computeRecap,
  formatCurrency,
  formatDateRange,
  recapHeadline,
  type RecapCity,
} from "@travel/core";
import { travelApi } from "../lib/api";
import { Card, Button } from "./ui";
import { TripMap } from "./TripMap";
import { TripAlbums } from "./TripAlbums";

const CONDITION_EMOJI: Record<string, string> = {
  Clear: "☀️",
  "Partly Cloudy": "⛅",
  Overcast: "☁️",
  Fog: "🌫️",
  Drizzle: "🌦️",
  "Freezing Rain": "🌨️",
  Rain: "🌧️",
  Snow: "❄️",
  "Rain Showers": "🌦️",
  "Snow Showers": "🌨️",
  Thunderstorm: "⛈️",
};

/** Mirrors web's trip-recap.tsx and reads the same `computeRecap` — read-only,
 * against queries the app already caches offline. The one thing it can't do
 * offline is the weather summary, which needs the server (and is cached there
 * per leg, so it only ever costs one fetch). */
export function TripRecap({
  tripId,
  trip,
  legs,
  onShowFullTrip,
}: {
  tripId: number;
  trip: Trip;
  legs: Trip["legs"];
  onShowFullTrip: () => void;
}) {
  const { data: items } = useQuery(travelApi.queries.itineraryQuery(tripId));
  const { data: places } = useQuery(travelApi.queries.placesQuery({ tripId }));
  const { data: bookings } = useQuery(travelApi.queries.bookingsQuery(tripId));
  const { data: dayNotes } = useQuery(travelApi.queries.dayNotesQuery(tripId));
  const { data: budget } = useQuery(travelApi.queries.budgetQuery(tripId));
  const { data: weather } = useQuery(travelApi.queries.recapWeatherQuery(tripId));
  const { data: sources } = useQuery(travelApi.queries.fundingSourcesQuery());

  const recap = computeRecap({
    trip,
    legs,
    items: items ?? [],
    places: places ?? [],
    bookings: bookings ?? [],
    dayNotes: dayNotes ?? [],
    spendByLeg: budget?.byLeg,
    spend: budget ? { current: budget.grand.current, estimated: budget.grand.estimated } : null,
    homeCurrency: budget?.homeCurrency ?? trip.homeCurrency,
  });

  const money = (n: number) => formatCurrency(n, recap.homeCurrency ?? "USD");
  const bySource = (budget?.bySource ?? []).filter((s) => s.current !== 0);
  const sourceName = (id: number | null) =>
    id == null ? "Unassigned" : (sources?.find((s) => s.id === id)?.name ?? "Unassigned");

  return (
    <View className="p-4">
      <Card className="mb-4">
        <Text className="text-lg font-semibold text-text-primary dark:text-text-primary-dark">
          {recapHeadline(recap)}
        </Text>
        <Text className="mt-1 text-sm text-text-secondary dark:text-text-secondary-dark">
          {recap.placesVisited} checked off
          {recap.placesNotCheckedOff > 0 ? ` · ${recap.placesNotCheckedOff} not checked off` : ""}
          {recap.spend != null ? ` · ${money(recap.spend)} spent` : ""}
          {recap.spend != null && recap.budgeted != null && recap.budgeted > 0
            ? ` of ${money(recap.budgeted)} budgeted`
            : ""}
        </Text>
        {/* Honest for flights only — never presented as distance travelled. */}
        {recap.crowFlightKm != null && (
          <Text className="mt-1 text-xs text-text-muted">
            {recap.crowFlightKm.toLocaleString()} km between cities, as the crow flies
          </Text>
        )}
        {bySource.length > 0 && (
          <View className="mt-2 flex-row flex-wrap gap-x-4 border-t border-gridline pt-2">
            {bySource.map((s) => (
              <Text
                key={s.fundingSourceId ?? "none"}
                className="text-sm text-text-secondary dark:text-text-secondary-dark"
              >
                <Text className="text-text-muted">{sourceName(s.fundingSourceId)}</Text>{" "}
                {money(s.current)}
              </Text>
            ))}
          </View>
        )}
        <Button className="mt-3" variant="secondary" title="Show full trip" onPress={onShowFullTrip} />
      </Card>

      <TripAlbums tripId={tripId} />

      {recap.cities.map((city) => (
        <CityBlock key={city.legId} city={city} homeCurrency={recap.homeCurrency} />
      ))}

      {weather && weather.length > 0 && (
        <>
          <Text className="mb-2 mt-4 text-xs font-semibold uppercase text-text-muted">Weather</Text>
          <Card>
            {weather.map((w) => (
              <Text
                key={w.legId}
                className="mb-1 text-sm text-text-secondary dark:text-text-secondary-dark"
              >
                <Text className="font-medium text-text-primary dark:text-text-primary-dark">{w.city}</Text>
                {" — "}
                {CONDITION_EMOJI[w.dominantCondition] ?? ""} avg {w.avgHighF}°/{w.avgLowF}°,{" "}
                {w.dominantCondition.toLowerCase()}
                {w.precipDays > 0 ? `, rain ${w.precipDays} of ${w.dayCount} days` : ""}
                {!w.isComplete ? ` (first ${w.dayCount} days — rest not yet published)` : ""}
              </Text>
            ))}
          </Card>
        </>
      )}

      <Text className="mb-2 mt-4 text-xs font-semibold uppercase text-text-muted">Map</Text>
      <TripMap tripId={tripId} />
    </View>
  );
}

function CityBlock({ city, homeCurrency }: { city: RecapCity; homeCurrency: string | null }) {
  const dates =
    city.startDate && city.endDate ? formatDateRange(city.startDate, city.endDate) : "No dates recorded";
  return (
    <Card className="mb-3">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-base font-semibold text-text-primary dark:text-text-primary-dark">
          {city.city}
          {city.country ? <Text className="text-sm font-normal text-text-muted">  {city.country}</Text> : null}
        </Text>
        {city.spend != null && (
          <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
            {formatCurrency(city.spend, homeCurrency ?? "USD")}
          </Text>
        )}
      </View>
      <Text className="text-xs text-text-muted">
        {dates}
        {city.nights != null ? ` · ${city.nights} ${city.nights === 1 ? "night" : "nights"}` : ""}
      </Text>

      {city.groups.map((group) => (
        <View key={group.category} className="mt-3">
          <Text className="text-xs font-semibold uppercase text-text-muted">{group.category}</Text>
          {group.done.length > 0 ? (
            group.done.map((label, i) => (
              <Text
                key={`${label}-${i}`}
                className="text-sm text-text-secondary dark:text-text-secondary-dark"
              >
                • {label}
              </Text>
            ))
          ) : (
            <Text className="text-sm text-text-muted">Nothing checked off</Text>
          )}
          {group.notCheckedOff > 0 && (
            <Text className="mt-0.5 text-xs text-text-muted">
              {group.notCheckedOff} more never checked off
            </Text>
          )}
        </View>
      ))}

      {city.notes.length > 0 && (
        <View className="mt-3 border-t border-gridline pt-2">
          <Text className="text-xs font-semibold uppercase text-text-muted">Notes</Text>
          {city.notes.map((n) => (
            <Text key={n.date} className="text-sm text-text-secondary dark:text-text-secondary-dark">
              <Text className="text-text-muted">{n.date.slice(5)}</Text> {n.note}
            </Text>
          ))}
        </View>
      )}
    </Card>
  );
}
