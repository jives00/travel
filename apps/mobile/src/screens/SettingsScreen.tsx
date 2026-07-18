import { useState } from "react";
import { View, Text } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { travelApi } from "../lib/api";
import { queryClient } from "../lib/queryClient";
import { useUpdateSettings } from "../lib/offlineMutations/settings";
import { useTheme } from "../lib/theme";
import { Screen, Card, SegmentedControl, TextField, Button } from "../components/ui";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View className="mb-5">
      <Text className="mb-2 text-xs font-semibold uppercase text-text-muted">{title}</Text>
      {children}
    </View>
  );
}

/** Full settings — mirrors web's settings-form.tsx. Theme is local; the rest go
 * through the offline settings mutation (optimistic, queues offline). */
export function SettingsScreen() {
  const { data: settings } = useQuery(travelApi.queries.settingsQuery());
  const update = useUpdateSettings();
  const { theme, setTheme } = useTheme();
  const [currency, setCurrency] = useState("");
  const [buffer, setBuffer] = useState("");

  return (
    <Screen scroll>
      <Section title="Theme">
        <SegmentedControl
          value={theme}
          onChange={setTheme}
          segments={[
            { value: "light", label: "Light" },
            { value: "dark", label: "Dark" },
          ]}
        />
      </Section>

      {settings && (
        <>
          <Section title="Distance unit">
            <SegmentedControl
              value={settings.distanceUnit}
              onChange={(distanceUnit) => update.mutate({ distanceUnit })}
              segments={[
                { value: "mi", label: "Miles" },
                { value: "km", label: "Kilometers" },
              ]}
            />
          </Section>

          <Section title="Default map travel mode">
            <SegmentedControl
              value={settings.defaultTravelMode}
              onChange={(defaultTravelMode) => update.mutate({ defaultTravelMode })}
              segments={[
                { value: "walk", label: "Walk" },
                { value: "transit", label: "Transit" },
                { value: "drive", label: "Drive" },
              ]}
            />
          </Section>

          <Section title="Default route buffer">
            <Text className="mb-1 text-sm text-text-secondary dark:text-text-secondary-dark">
              Currently {settings.defaultBufferM}m
            </Text>
            <View className="flex-row gap-2">
              <TextField
                className="w-28"
                keyboardType="number-pad"
                placeholder="meters"
                value={buffer}
                onChangeText={setBuffer}
              />
              <Button
                title="Save"
                onPress={() => {
                  const v = Number(buffer);
                  if (v > 0) update.mutate({ defaultBufferM: v });
                  setBuffer("");
                }}
              />
            </View>
          </Section>

          <Section title="Home currency">
            <Text className="mb-1 text-sm text-text-secondary dark:text-text-secondary-dark">
              Currently {settings.homeCurrency ?? "not set"}
            </Text>
            <View className="flex-row gap-2">
              <TextField
                className="w-28"
                autoCapitalize="characters"
                maxLength={3}
                placeholder="USD"
                value={currency}
                onChangeText={setCurrency}
              />
              <Button
                title="Save"
                onPress={() => {
                  const v = currency.trim().toUpperCase();
                  if (v.length === 3) update.mutate({ homeCurrency: v });
                  setCurrency("");
                }}
              />
            </View>
          </Section>

          <Section title="Private itinerary items">
            <SegmentedControl
              value={settings.showPrivateItems ? "show" : "hide"}
              onChange={(v) => update.mutate({ showPrivateItems: v === "show" })}
              segments={[
                { value: "show", label: "Show private items" },
                { value: "hide", label: "Hide private items" },
              ]}
            />
          </Section>
        </>
      )}

      <Section title="Data">
        <Card>
          <Text className="mb-2 text-xs text-text-muted">
            Clears the local offline cache. Anything not yet synced to the server will be lost.
          </Text>
          <Button variant="danger" title="Clear local cache" onPress={() => queryClient.clear()} />
        </Card>
      </Section>
    </Screen>
  );
}
