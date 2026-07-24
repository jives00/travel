import { useState } from "react";
import { View, Text, Pressable, RefreshControl, KeyboardAvoidingView, Platform } from "react-native";
import { useQuery } from "@tanstack/react-query";
import { NestableScrollContainer, NestableDraggableFlatList } from "react-native-draggable-flatlist";
import { travelApi } from "../lib/api";
import { usePullToRefresh } from "../lib/usePullToRefresh";
import { useCreateList, useReorderLists } from "../lib/offlineMutations/lists";
import { Screen, TextField, Button } from "../components/ui";
import { ListCard } from "../components/ListCard";
import { TripPickerSheet } from "../components/TripPickerSheet";

export function ListsScreen() {
  const { data: lists } = useQuery(travelApi.queries.listsQuery());
  const [name, setName] = useState("");
  const [newListTripId, setNewListTripId] = useState<number | null>(null);
  const [pickingTrip, setPickingTrip] = useState(false);
  const createList = useCreateList();
  const reorderLists = useReorderLists();
  const { refreshing, onRefresh } = usePullToRefresh();

  return (
    <Screen padded={false}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <NestableScrollContainer
          contentContainerStyle={{ padding: 16 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        >
          <View className="mb-3 flex-row gap-2">
            <TextField
              className="flex-1"
              placeholder="New list (e.g. Packing list)…"
              value={name}
              onChangeText={setName}
            />
            <Pressable
              onPress={() => setPickingTrip(true)}
              className="justify-center rounded border border-gridline px-3 dark:border-gridline-dark"
            >
              <Text className="text-xs text-text-secondary dark:text-text-secondary-dark">
                {newListTripId ? "Trip" : "Global"}
              </Text>
            </Pressable>
            <Button
              title="Create"
              onPress={() => {
                if (name.trim()) {
                  createList.create(name.trim(), newListTripId ?? undefined);
                  setName("");
                  setNewListTripId(null);
                }
              }}
            />
          </View>

          {(lists ?? []).length === 0 ? (
            <Text className="text-text-muted">No lists yet — create one above.</Text>
          ) : (
            <NestableDraggableFlatList
              data={lists ?? []}
              keyExtractor={(l) => String(l.id)}
              renderItem={({ item, drag, isActive }) => (
                <ListCard list={item} onDragHandleLongPress={drag} isDragging={isActive} />
              )}
              onDragEnd={({ data }) => reorderLists.mutate({ listIds: data.map((l) => l.id) })}
            />
          )}
        </NestableScrollContainer>
      </KeyboardAvoidingView>

      <TripPickerSheet visible={pickingTrip} onClose={() => setPickingTrip(false)} onSelect={setNewListTripId} />
    </Screen>
  );
}
