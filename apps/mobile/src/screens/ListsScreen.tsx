import { useState } from "react";
import { View, Text, Pressable, FlatList } from "react-native";
import { useQuery } from "@tanstack/react-query";
import type { ListWithItems } from "@travel/types";
import { travelApi } from "../lib/api";
import {
  useCreateList,
  useAddItem,
  useSetItemDone,
  useRemoveItem,
  useCopyList,
  useResetList,
} from "../lib/offlineMutations/lists";
import { Screen, Card, TextField, Button } from "../components/ui";

function ListCard({ list }: { list: ListWithItems }) {
  const [text, setText] = useState("");
  const addItem = useAddItem();
  const setDone = useSetItemDone();
  const removeItem = useRemoveItem();
  const copy = useCopyList();
  const reset = useResetList();

  return (
    <Card className="mb-3">
      <View className="mb-2 flex-row items-center justify-between">
        <Text className="font-medium text-text-primary dark:text-text-primary-dark">{list.name}</Text>
        <View className="flex-row gap-3">
          {list.tripId ? <Text className="text-xs text-text-muted">Trip</Text> : null}
          <Pressable onPress={() => reset.mutate({ listId: list.id })}>
            <Text className="text-xs text-text-secondary dark:text-text-secondary-dark">Reset</Text>
          </Pressable>
          <Pressable onPress={() => copy.mutate({ listId: list.id })}>
            <Text className="text-xs text-text-secondary dark:text-text-secondary-dark">Copy</Text>
          </Pressable>
        </View>
      </View>

      {list.items.length === 0 ? (
        <Text className="mb-2 text-sm text-text-muted">No items yet.</Text>
      ) : (
        list.items.map((item) => (
          <View key={item.id} className="flex-row items-center justify-between py-1">
            <Pressable
              className="flex-1 flex-row items-center gap-2"
              onPress={() => setDone.mutate({ listId: list.id, itemId: item.id, done: !item.done })}
            >
              <Text className="text-base">{item.done ? "☑" : "☐"}</Text>
              <Text
                className={
                  item.done
                    ? "text-sm text-text-muted line-through"
                    : "text-sm text-text-primary dark:text-text-primary-dark"
                }
              >
                {item.text}
              </Text>
            </Pressable>
            <Pressable onPress={() => removeItem.mutate({ listId: list.id, itemId: item.id })} className="px-2">
              <Text className="text-text-muted">✕</Text>
            </Pressable>
          </View>
        ))
      )}

      <View className="mt-2 flex-row gap-2">
        <TextField
          className="flex-1"
          placeholder="Add an item…"
          value={text}
          onChangeText={setText}
          onSubmitEditing={() => {
            if (text.trim()) {
              addItem.add(list.id, text.trim());
              setText("");
            }
          }}
          returnKeyType="done"
        />
        <Button
          title="Add"
          variant="secondary"
          onPress={() => {
            if (text.trim()) {
              addItem.add(list.id, text.trim());
              setText("");
            }
          }}
        />
      </View>
    </Card>
  );
}

export function ListsScreen() {
  const { data: lists } = useQuery(travelApi.queries.listsQuery());
  const [name, setName] = useState("");
  const createList = useCreateList();

  return (
    <Screen padded={false}>
      <FlatList
        data={lists ?? []}
        keyExtractor={(l) => String(l.id)}
        contentContainerStyle={{ padding: 16 }}
        ListHeaderComponent={
          <View className="mb-3 flex-row gap-2">
            <TextField
              className="flex-1"
              placeholder="New list (e.g. Packing list)…"
              value={name}
              onChangeText={setName}
            />
            <Button
              title="Create"
              onPress={() => {
                if (name.trim()) {
                  createList.create(name.trim());
                  setName("");
                }
              }}
            />
          </View>
        }
        renderItem={({ item }) => <ListCard list={item} />}
        ListEmptyComponent={<Text className="text-text-muted">No lists yet — create one above.</Text>}
      />
    </Screen>
  );
}
