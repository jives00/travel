import { View, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { travelApi } from "../lib/api";
import { Card } from "./ui";

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

// Groups consecutive same-city days so the city name can be rendered once,
// spanning the width of its days, instead of repeating (and misaligning
// the day columns) inside each individual day.
function citySegments(days: { city: string }[]): { city: string; length: number }[] {
  const segments: { city: string; length: number }[] = [];
  for (const day of days) {
    const last = segments[segments.length - 1];
    if (last && last.city === day.city) last.length += 1;
    else segments.push({ city: day.city, length: 1 });
  }
  return segments;
}

/** N-day forecast strip — port of web's trip-weather.tsx. Disappears when there's
 * no city or the trip's dated legs are all in the past (forecast not meaningful);
 * offline it shows the last-cached forecast, or nothing. */
export function TripWeather({ tripId }: { tripId: number }) {
  const { data, isPending } = useQuery(travelApi.queries.weatherQuery(tripId));

  if (isPending) {
    return (
      <View className="mb-4">
        <Text className="mb-2 text-xs font-semibold uppercase text-text-muted">Weather</Text>
        <Card>
          <View className="h-16 animate-pulse rounded bg-page dark:bg-page-dark" />
        </Card>
      </View>
    );
  }

  if (!data || data.days.length === 0) return null;

  const segments = citySegments(data.days);

  return (
    <View className="mb-4">
      <Text className="mb-2 text-xs font-semibold uppercase text-text-muted">Weather</Text>
      <Card>
        <View className="flex-row gap-2">
          {segments.map((seg, i) => (
            <Text
              key={i}
              className="text-left text-xs font-medium text-text-muted"
              style={{ flex: seg.length }}
              numberOfLines={1}
            >
              {seg.city}
            </Text>
          ))}
        </View>
        <View className="mt-1 flex-row gap-2">
          {data.days.map((day, i) => (
            <View key={day.date} className="flex-1 items-center gap-1">
              <Text className="text-xs text-text-muted" numberOfLines={1}>
                {dayLabel(day.date, i)}
              </Text>
              <Text className="text-2xl">{CONDITION_EMOJI[day.condition] ?? "—"}</Text>
              <Text className="text-sm text-text-primary dark:text-text-primary-dark" numberOfLines={1}>
                {day.tempMaxF}° <Text className="text-text-muted">{day.tempMinF}°</Text>
              </Text>
            </View>
          ))}
        </View>
      </Card>
    </View>
  );
}
