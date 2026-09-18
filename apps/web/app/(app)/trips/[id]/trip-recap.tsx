"use client";

import { useQuery } from "@tanstack/react-query";
import type { Trip } from "@travel/types";
import {
  computeRecap,
  formatCurrency,
  formatDateRange,
  recapHeadline,
  type Recap,
  type RecapCity,
} from "@travel/core";
import { travelApi } from "@/lib/api";
import { TripMap } from "./trip-map";
import { TripAlbums } from "./trip-albums";

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

/** Replaces the plan once a trip is `past` (plans/todo.md #9a). Lists come out
 * entirely — a packing list read back in November is noise — and stay reachable
 * through the "show full trip" toggle, which is the whole reason it exists. */
export function TripRecap({
  tripId,
  trip,
  onShowFullTrip,
}: {
  tripId: number;
  trip: Trip;
  onShowFullTrip: () => void;
}) {
  const { data: items } = useQuery(travelApi.queries.itineraryQuery(tripId));
  const { data: places } = useQuery(travelApi.queries.placesQuery({ tripId }));
  const { data: bookings } = useQuery(travelApi.queries.bookingsQuery(tripId));
  const { data: dayNotes } = useQuery(travelApi.queries.dayNotesQuery(tripId));
  const { data: budget } = useQuery(travelApi.queries.budgetQuery(tripId));
  const { data: weather } = useQuery(travelApi.queries.recapWeatherQuery(tripId));

  const recap = computeRecap({
    trip,
    legs: trip.legs,
    items: items ?? [],
    places: places ?? [],
    bookings: bookings ?? [],
    dayNotes: dayNotes ?? [],
    spendByLeg: budget?.byLeg,
    spend: budget ? { current: budget.grand.current, estimated: budget.grand.estimated } : null,
    homeCurrency: budget?.homeCurrency ?? trip.homeCurrency,
  });

  return (
    <div className="space-y-6">
      {/* Albums span the top, ahead of the summary — the layout decided 2026-09-14. */}
      <TripAlbums tripId={tripId} />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <section className="space-y-4 lg:col-span-2">
          <RecapHeader recap={recap} bySource={budget?.bySource ?? []} onShowFullTrip={onShowFullTrip} />
          {recap.cities.map((city) => (
            <CityBlock key={city.legId} city={city} homeCurrency={recap.homeCurrency} />
          ))}
        </section>

        <div className="space-y-4 self-start lg:sticky lg:top-20">
          <section>
            <h2 className="mb-2 text-sm font-semibold uppercase text-text-muted">Map</h2>
            <TripMap tripId={tripId} hoveredPlaceId={null} activeLegId={null} />
          </section>

          {weather && weather.length > 0 && (
            <section className="rounded border border-gridline bg-surface p-4">
              <h2 className="mb-2 text-sm font-semibold uppercase text-text-muted">Weather</h2>
              <ul className="space-y-2">
                {weather.map((w) => (
                  <li key={w.legId} className="text-sm text-text-secondary">
                    <span className="font-medium text-text-primary">{w.city}</span> —{" "}
                    {CONDITION_EMOJI[w.dominantCondition] ?? ""} avg {w.avgHighF}°/{w.avgLowF}°,{" "}
                    {w.dominantCondition.toLowerCase()}
                    {w.precipDays > 0 && `, rain ${w.precipDays} of ${w.dayCount} days`}
                    {/* The archive trails real time by a few days, so a recap
                        opened right after landing can be short a day or two. Say
                        so rather than quietly averaging a partial trip. */}
                    {!w.isComplete && (
                      <span className="text-text-muted"> (first {w.dayCount} days — rest not yet published)</span>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

function RecapHeader({
  recap,
  bySource,
  onShowFullTrip,
}: {
  recap: Recap;
  bySource: { fundingSourceId: number | null; current: number }[];
  onShowFullTrip: () => void;
}) {
  const money = (n: number) => formatCurrency(n, recap.homeCurrency ?? "USD");
  return (
    <section className="rounded border border-gridline bg-surface p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-lg font-semibold text-text-primary">{recapHeadline(recap)}</div>
          <div className="mt-1 text-sm text-text-secondary">
            {recap.placesVisited} checked off
            {recap.placesNotCheckedOff > 0 && ` · ${recap.placesNotCheckedOff} not checked off`}
            {recap.spend != null && ` · ${money(recap.spend)} spent`}
            {recap.spend != null && recap.budgeted != null && recap.budgeted > 0 && (
              <> of {money(recap.budgeted)} budgeted</>
            )}
          </div>
          {/* Great-circle between consecutive cities is honest for flights and
              nothing else, so it says so rather than claiming a travelled
              distance it can't know. */}
          {recap.crowFlightKm != null && (
            <div className="mt-1 text-xs text-text-muted">
              {recap.crowFlightKm.toLocaleString()} km between cities, as the crow flies
            </div>
          )}
        </div>
        <button onClick={onShowFullTrip} className="shrink-0 text-sm text-category-transit hover:underline">
          Show full trip
        </button>
      </div>
      <BySource bySource={bySource} homeCurrency={recap.homeCurrency} />
    </section>
  );
}

/** The first thing outside the budget screen to read `bySource` — the open item
 * left by #12. A grouping, not a second total: "what did this actually cost me"
 * is answered by where the money came from, so a line that merely re-adds to
 * the same grand total would say nothing. */
function BySource({
  bySource,
  homeCurrency,
}: {
  bySource: { fundingSourceId: number | null; current: number }[];
  homeCurrency: string | null;
}) {
  const { data: sources } = useQuery(travelApi.queries.fundingSourcesQuery());
  const spent = bySource.filter((s) => s.current !== 0);
  if (spent.length === 0) return null;

  // Renaming a source changes no arithmetic — nothing branches on the name —
  // so an id with no matching row is just an unnamed bucket, not an error.
  const nameFor = (id: number | null) =>
    id == null ? "Unassigned" : (sources?.find((s) => s.id === id)?.name ?? "Unassigned");

  return (
    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-gridline pt-2 text-sm text-text-secondary">
      {spent.map((s) => (
        <span key={s.fundingSourceId ?? "none"}>
          <span className="text-text-muted">{nameFor(s.fundingSourceId)}</span>{" "}
          {formatCurrency(s.current, homeCurrency ?? "USD")}
        </span>
      ))}
    </div>
  );
}

function CityBlock({ city, homeCurrency }: { city: RecapCity; homeCurrency: string | null }) {
  const dates =
    city.startDate && city.endDate ? formatDateRange(city.startDate, city.endDate) : "No dates recorded";
  return (
    <section className="rounded border border-gridline bg-surface p-4">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-base font-semibold text-text-primary">
          {city.city}
          {city.country && <span className="ml-2 text-sm font-normal text-text-muted">{city.country}</span>}
        </h3>
        {city.spend != null && (
          <span className="text-sm text-text-secondary">{formatCurrency(city.spend, homeCurrency ?? "USD")}</span>
        )}
      </div>
      <div className="text-xs text-text-muted">
        {dates}
        {city.nights != null && ` · ${city.nights} ${city.nights === 1 ? "night" : "nights"}`}
      </div>

      {city.groups.map((group) => (
        <div key={group.category} className="mt-3">
          <div className="text-xs font-semibold uppercase text-text-muted">{group.category}</div>
          {group.done.length > 0 ? (
            <ul className="mt-1 list-inside list-disc space-y-0.5 text-sm text-text-secondary">
              {group.done.map((label, i) => (
                <li key={`${label}-${i}`}>{label}</li>
              ))}
            </ul>
          ) : (
            <div className="mt-1 text-sm text-text-muted">Nothing checked off</div>
          )}
          {group.notCheckedOff > 0 && (
            <div className="mt-1 text-xs text-text-muted">
              {group.notCheckedOff} more never checked off
            </div>
          )}
        </div>
      ))}

      {city.notes.length > 0 && (
        <div className="mt-3 border-t border-gridline pt-2">
          <div className="text-xs font-semibold uppercase text-text-muted">Notes</div>
          <ul className="mt-1 space-y-1 text-sm text-text-secondary">
            {city.notes.map((n) => (
              <li key={n.date}>
                <span className="text-text-muted">{n.date.slice(5)}</span> {n.note}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
