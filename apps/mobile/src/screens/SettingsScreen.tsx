import { useState } from "react";
import { View, Text, Pressable } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { travelApi } from "../lib/api";
import { queryClient } from "../lib/queryClient";
import { useUpdateSettings } from "../lib/offlineMutations/settings";
import {
  useCreateFundingSource,
  useRemoveFundingSource,
  useUpdateFundingSource,
} from "../lib/offlineMutations/fundingSources";
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
  const [timezone, setTimezone] = useState("");

  // Hermes ships Intl, but a missing/odd platform ICU would make this throw
  // rather than return a zone — and a settings screen is not worth crashing.
  let deviceTimezone: string | null = null;
  try {
    deviceTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    deviceTimezone = null;
  }

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

          <Section title="Home timezone">
            <Text className="mb-1 text-sm text-text-secondary dark:text-text-secondary-dark">
              Used by Add to Google Calendar for anything not tied to a trip city. Currently{" "}
              {settings.homeTimezone ?? "not set"}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              <TextField
                className="w-44"
                autoCapitalize="none"
                maxLength={64}
                placeholder="America/Chicago"
                value={timezone}
                onChangeText={setTimezone}
              />
              <Button
                title="Save"
                onPress={() => {
                  const v = timezone.trim();
                  if (v) update.mutate({ homeTimezone: v });
                  setTimezone("");
                }}
              />
              {deviceTimezone && (
                <Button
                  variant="secondary"
                  title="Use this phone's"
                  onPress={() => update.mutate({ homeTimezone: deviceTimezone })}
                />
              )}
              {settings.homeTimezone && (
                <Button variant="secondary" title="Clear" onPress={() => update.mutate({ homeTimezone: null })} />
              )}
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

      <FundingSourcesSection />

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

/** Mirrors web's funding-sources section. Writes go through the offline
 * mutations so a source added on a plane still shows up in the budget picker
 * and syncs later. */
function FundingSourcesSection() {
  const { data: sources } = useQuery(travelApi.queries.fundingSourcesQuery());
  const create = useCreateFundingSource();
  const update = useUpdateFundingSource();
  const remove = useRemoveFundingSource();
  const [adding, setAdding] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");

  function saveRename(id: number, current: string) {
    const name = editingName.trim();
    if (name && name !== current) update.rename(id, name);
    setEditingId(null);
  }

  return (
    <Section title="Funding sources">
      <Text className="mb-2 text-sm text-text-secondary dark:text-text-secondary-dark">
        Where the money for an expense or booking came from. Deleting one leaves its budget lines in place — they
        just go back to unassigned.
      </Text>

      {(sources ?? []).map((source) => (
        <Card key={source.id} className="mb-2 flex-row items-center justify-between">
          {editingId === source.id ? (
            <>
              <TextField
                className="mr-2 flex-1"
                autoFocus
                maxLength={80}
                value={editingName}
                onChangeText={setEditingName}
              />
              <Pressable onPress={() => saveRename(source.id, source.name)}>
                <Text className="text-sm text-category-transit">Save</Text>
              </Pressable>
            </>
          ) : (
            <>
              <Text className="mr-2 flex-1 text-text-primary dark:text-text-primary-dark" numberOfLines={1}>
                {source.name}
              </Text>
              <View className="flex-row gap-4">
                <Pressable
                  onPress={() => {
                    setEditingId(source.id);
                    setEditingName(source.name);
                  }}
                >
                  <Text className="text-sm text-category-transit">Rename</Text>
                </Pressable>
                <Pressable onPress={() => remove.remove(source.id)}>
                  <Text className="text-sm text-status-critical">Delete</Text>
                </Pressable>
              </View>
            </>
          )}
        </Card>
      ))}

      <View className="flex-row gap-2">
        <TextField
          className="flex-1"
          maxLength={80}
          placeholder="Add a source (e.g. Amex)"
          value={adding}
          onChangeText={setAdding}
        />
        <Button
          title="Add"
          onPress={() => {
            const name = adding.trim();
            if (name) create.create(name);
            setAdding("");
          }}
        />
      </View>
    </Section>
  );
}
