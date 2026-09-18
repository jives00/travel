import { useState } from "react";
import { View, Text, Image, Pressable, ScrollView, Linking } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { TripLink } from "@travel/types";
import { absoluteApiUrl, travelApi } from "../lib/api";
import { useCreateTripLink, useRemoveTripLink, useUpdateTripLink } from "../lib/offlineMutations/tripLinks";
import { Card, Button, TextField, Sheet } from "./ui";

/** Mirrors web's trip-albums.tsx — links out to photo albums, as their own
 * section rather than folded into the itinerary (plans/todo.md #9b).
 *
 * Thumbnails are uploaded from the web app, never fetched (see `TripLink` in
 * `@travel/types`). Mobile displays them but cannot create them: picking an
 * image needs `expo-image-picker`, a native module, and adding one forces a
 * dev-client and APK rebuild — deliberately deferred rather than smuggled in.
 *
 * Placement is the caller's (see `albumsAtTop` in TripDetailView): an empty box
 * on a trip that hasn't happened yet sinks to the bottom. */
export function TripAlbums({ tripId }: { tripId: number }) {
  const { data: links } = useQuery(travelApi.queries.tripLinksQuery(tripId));

  const [editing, setEditing] = useState<TripLink | "new" | null>(null);
  const create = useCreateTripLink(tripId);
  const update = useUpdateTripLink(tripId);
  const remove = useRemoveTripLink(tripId);

  const rows = links ?? [];

  return (
    <>
      <View className="mb-2 mt-4 flex-row items-center justify-between">
        <Text className="text-xs font-semibold uppercase text-text-muted">Photo albums</Text>
        <Pressable onPress={() => setEditing("new")} hitSlop={8}>
          <Text className="text-xs text-category-transit">+ Add</Text>
        </Pressable>
      </View>

      {rows.length === 0 ? (
        <Card>
          <Text className="text-sm text-text-secondary dark:text-text-secondary-dark">
            No albums linked yet.
          </Text>
        </Card>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} className="-mx-1">
          {rows.map((link) => {
            // An uploaded thumbnail is a relative API path — resolve it against
            // whichever base this device probed to.
            const thumbnailUri = absoluteApiUrl(link.thumbnailUrl);
            return (
              <View key={link.id} className="mx-1 w-[312px]">
                <Pressable onPress={() => void Linking.openURL(link.url)} onLongPress={() => setEditing(link)}>
                  {thumbnailUri ? (
                    <Image
                      source={{ uri: thumbnailUri }}
                      className="h-[176px] w-[312px] rounded bg-surface dark:bg-surface-dark"
                      resizeMode="cover"
                    />
                  ) : (
                    <View className="h-[176px] w-[312px] items-center justify-center rounded bg-surface dark:bg-surface-dark">
                      <Text className="text-xs text-text-muted">No image</Text>
                    </View>
                  )}
                </Pressable>
                <Text
                  numberOfLines={1}
                  className="mt-1 text-base text-text-primary dark:text-text-primary-dark"
                >
                  {link.label}
                </Text>
              </View>
            );
          })}
        </ScrollView>
      )}

      <AlbumSheet
        visible={editing !== null}
        link={editing === "new" || editing === null ? null : editing}
        onClose={() => setEditing(null)}
        onSave={(label, url) => {
          if (editing === "new") {
            create.create({ label, url });
          } else if (editing) {
            update.mutate({ tripId, id: editing.id, body: { label, url } });
          }
          setEditing(null);
        }}
        onDelete={
          editing && editing !== "new"
            ? () => {
                remove.mutate({ tripId, id: editing.id });
                setEditing(null);
              }
            : undefined
        }
      />
    </>
  );
}

function AlbumSheet({
  visible,
  link,
  onClose,
  onSave,
  onDelete,
}: {
  visible: boolean;
  link: TripLink | null;
  onClose: () => void;
  onSave: (label: string, url: string) => void;
  onDelete?: () => void;
}) {
  const [label, setLabel] = useState(link?.label ?? "");
  const [url, setUrl] = useState(link?.url ?? "");
  const [error, setError] = useState<string | null>(null);

  // The sheet is mounted once and reused, so the draft is reset from whichever
  // link it was opened on rather than in a useState initializer that only runs
  // on first mount.
  const [openedFor, setOpenedFor] = useState<number | null | undefined>(undefined);
  const openKey = link?.id ?? null;
  if (visible && openedFor !== openKey) {
    setOpenedFor(openKey);
    setLabel(link?.label ?? "");
    setUrl(link?.url ?? "");
    setError(null);
  }

  function save() {
    if (!label.trim() || !url.trim()) return;
    if (!/^https?:\/\//i.test(url.trim())) {
      setError("The link must start with http:// or https://");
      return;
    }
    onSave(label.trim(), url.trim());
  }

  return (
    <Sheet visible={visible} onClose={onClose}>
      <Text className="mb-3 text-lg font-semibold text-text-primary dark:text-text-primary-dark">
        {link ? "Edit album" : "Add album"}
      </Text>
      <TextField
        className="mb-3"
        label="Name"
        value={label}
        onChangeText={setLabel}
        placeholder="Seville — day 2"
      />
      <TextField
        className="mb-3"
        label="Share link"
        value={url}
        onChangeText={setUrl}
        placeholder="https://…"
        autoCapitalize="none"
        keyboardType="url"
      />
      <Text className="mb-3 text-xs text-text-muted">
        Add the card image from the web app.
      </Text>
      {error && <Text className="mb-3 text-sm text-status-critical">{error}</Text>}
      <View className="flex-row gap-2">
        <Button className="flex-1" title="Save" onPress={save} disabled={!label.trim() || !url.trim()} />
        <Button className="flex-1" variant="secondary" title="Cancel" onPress={onClose} />
      </View>
      {onDelete && <Button className="mt-2" variant="secondary" title="Delete" onPress={onDelete} />}
    </Sheet>
  );
}
