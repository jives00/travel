"use client";

import { useQuery } from "@tanstack/react-query";
import { travelApi } from "@/lib/api";

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

function dayLabel(dateStr: string, index: number): string {
  if (index === 0) return "Today";
  if (index === 1) return "Tomorrow";
  return new Date(`${dateStr}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" });
}

export function TripWeather({ tripId }: { tripId: number }) {
  const { data, isPending } = useQuery(travelApi.queries.weatherQuery(tripId));

  // While the forecast is still loading, render a same-shaped skeleton
  // instead of nothing — otherwise this widget pops in above the map once
  // data arrives and shoves it down the page. Only collapse to nothing once
  // we know for sure there's nothing to show (no legs, or all in the past),
  // not just because the query hasn't resolved yet.
  if (isPending) {
    return (
      <div>
        <h2 className="mb-2 text-sm font-semibold uppercase text-text-muted">Weather</h2>
        <section className="rounded border border-gridline bg-surface p-4">
          <div className="flex justify-between gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-1 text-center">
                <div className="h-4 w-10 animate-pulse rounded bg-page" />
                <div className="h-9 w-9 animate-pulse rounded-full bg-page" />
                <div className="h-4 w-12 animate-pulse rounded bg-page" />
              </div>
            ))}
          </div>
        </section>
      </div>
    );
  }

  // No city (trip has no legs at all) or the trip's dated legs are entirely
  // in the past — a forecast isn't meaningful, so the widget just disappears
  // rather than showing something misleading.
  if (!data || data.days.length === 0) return null;

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold uppercase text-text-muted">Weather</h2>
      <section className="rounded border border-gridline bg-surface p-4">
        <div className="flex justify-between gap-2">
          {data.days.map((day, i) => {
            const cityChanged = i === 0 || day.city !== data.days[i - 1].city;
            return (
              <div key={day.date} className="flex flex-1 items-stretch gap-2">
                {i > 0 && cityChanged && <div className="w-px shrink-0 bg-gridline" />}
                <div className="flex flex-1 flex-col items-center gap-1 text-center">
                  {cityChanged && (
                    <div className="truncate text-xs font-medium text-text-muted">{day.city}</div>
                  )}
                  <div className="text-sm text-text-muted">{dayLabel(day.date, i)}</div>
                  <div className="text-3xl" title={day.condition}>
                    {CONDITION_EMOJI[day.condition] ?? "—"}
                  </div>
                  <div className="text-sm text-text-primary">
                    {day.tempMaxF}° <span className="text-text-muted">{day.tempMinF}°</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
