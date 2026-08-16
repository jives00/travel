import { useState } from "react";
import { View, Text, Pressable, Alert } from "react-native";
import NestableDraggableFlatList from "react-native-draggable-flatlist";
import type { ListItem, ListWithItems } from "@travel/types";
import {
  useAddItem,
  useSetItemDone,
  useUpdateItemText,
  useRemoveItem,
  useCopyList,
  useResetList,
  useReorderItems,
  useSetTrip,
} from "../lib/offlineMutations/lists";
import { useHideDone, toggleHideDone } from "../lib/hideDoneLists";
import { TextField, Button, Card } from "./ui";
import { TripPickerSheet } from "./TripPickerSheet";

/** A single list's card: rename (via list-view header, not here), reset/copy,
 * trip link, and its items — checkable, editable, and (when `reorderable`)
 * drag-to-reorder. `reorderable` is off when rendered read-mostly inside
 * TripDetailView's Sheet, which already owns the surrounding scroll view and
 * can't host a second nested drag list on top of it. */
export function ListCard({
  list,
  reorderable = true,
  onDragHandleLongPress,
  isDragging = false,
  collapsed = false,
  onToggleCollapsed,
}: {
  list: ListWithItems;
  reorderable?: boolean;
  /** Long-pressing the header grip reorders this list among the others —
   * only meaningful when the parent renders ListCard inside a draggable list. */
  onDragHandleLongPress?: () => void;
  isDragging?: boolean;
  /** When `onToggleCollapsed` is supplied, the list name becomes a collapse
   * toggle (items + add-item form hide) — used by TripDetailView's Lists
   * sheet, which persists the collapsed set itself. */
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}) {
  const [text, setText] = useState("");
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [pickingTrip, setPickingTrip] = useState(false);
  const hideDone = useHideDone(list.id);
  const addItem = useAddItem();
  const setDone = useSetItemDone();
  const updateItemText = useUpdateItemText();
  const removeItem = useRemoveItem();
  const copy = useCopyList();
  const reset = useResetList();
  const reorderItems = useReorderItems();
  const setTrip = useSetTrip();

  function startEdit(item: ListItem) {
    setEditingItemId(item.id);
    setEditDraft(item.text);
  }

  function submitEdit(itemId: number) {
    const trimmed = editDraft.trim();
    setEditingItemId(null);
    if (trimmed) updateItemText.mutate({ listId: list.id, itemId, text: trimmed });
  }

  const doneCount = list.items.filter((i) => i.done).length;
  const visibleItems = hideDone ? list.items.filter((i) => !i.done) : list.items;

  /** Reordering works off the full item order even when completed items are
   * hidden: the dragged visible sequence is spliced back into the positions the
   * visible items held, so hidden items keep theirs. */
  function reorderedIds(visible: ListItem[]): number[] {
    if (!hideDone) return visible.map((i) => i.id);
    const slots = list.items.flatMap((item, index) => (item.done ? [] : [index]));
    const merged = list.items.map((i) => i.id);
    slots.forEach((slot, n) => {
      merged[slot] = visible[n].id;
    });
    return merged;
  }

  function renderItem(item: ListItem, drag?: () => void, isActive = false) {
    return (
      <View key={item.id} className={`flex-row items-center justify-between py-1 ${isActive ? "opacity-60" : ""}`}>
        {reorderable && (
          <Pressable onLongPress={drag} className="pr-2">
            <Text className="text-text-muted">⠿</Text>
          </Pressable>
        )}
        <Pressable onPress={() => setDone.mutate({ listId: list.id, itemId: item.id, done: !item.done })}>
          <Text className="text-2xl">{item.done ? "☑" : "☐"}</Text>
        </Pressable>
        {editingItemId === item.id ? (
          <TextField
            className="ml-2 flex-1"
            autoFocus
            value={editDraft}
            onChangeText={setEditDraft}
            onSubmitEditing={() => submitEdit(item.id)}
            onBlur={() => submitEdit(item.id)}
          />
        ) : (
          <Pressable className="ml-2 flex-1" onPress={() => startEdit(item)}>
            <Text
              className={
                item.done
                  ? "text-base text-text-muted line-through"
                  : "text-base text-text-primary dark:text-text-primary-dark"
              }
            >
              {item.text}
            </Text>
          </Pressable>
        )}
        <Pressable onPress={() => removeItem.mutate({ listId: list.id, itemId: item.id })} className="px-2">
          <Text className="text-text-muted">✕</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Card className={`mb-3 ${isDragging ? "opacity-60" : ""}`}>
      <View className="mb-2 flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          {onDragHandleLongPress && (
            <Pressable onLongPress={onDragHandleLongPress}>
              <Text className="text-text-muted">⠿</Text>
            </Pressable>
          )}
          {onToggleCollapsed ? (
            <Pressable className="flex-row items-center gap-1" onPress={onToggleCollapsed}>
              <Text className="text-text-muted">{collapsed ? "▸" : "▾"}</Text>
              <Text className="font-medium text-text-primary dark:text-text-primary-dark">{list.name}</Text>
            </Pressable>
          ) : (
            <Text className="font-medium text-text-primary dark:text-text-primary-dark">{list.name}</Text>
          )}
        </View>
        <View className="flex-row gap-3">
          <Pressable onPress={() => setPickingTrip(true)}>
            <Text className="text-xs text-text-secondary dark:text-text-secondary-dark">
              {list.tripId ? "Trip" : "Global"}
            </Text>
          </Pressable>
          <Pressable
            onPress={() =>
              Alert.alert("Reset list", `Uncheck every item in "${list.name}"?`, [
                { text: "Cancel", style: "cancel" },
                { text: "Reset", style: "destructive", onPress: () => reset.mutate({ listId: list.id }) },
              ])
            }
          >
            <Text className="text-xs text-text-secondary dark:text-text-secondary-dark">Reset</Text>
          </Pressable>
          <Pressable onPress={() => copy.mutate({ listId: list.id })}>
            <Text className="text-xs text-text-secondary dark:text-text-secondary-dark">Copy</Text>
          </Pressable>
          {doneCount > 0 && (
            <Pressable onPress={() => toggleHideDone(list.id)}>
              <Text className="text-xs text-text-secondary dark:text-text-secondary-dark">
                {hideDone ? `Show done (${doneCount})` : "Hide done"}
              </Text>
            </Pressable>
          )}
        </View>
      </View>

      {!collapsed && (
        <>
          {list.items.length === 0 ? (
            <Text className="mb-2 text-sm text-text-muted">No items yet.</Text>
          ) : visibleItems.length === 0 ? (
            <Text className="mb-2 text-sm text-text-muted">All {doneCount} items done.</Text>
          ) : reorderable ? (
            <NestableDraggableFlatList
              data={visibleItems}
              keyExtractor={(item) => String(item.id)}
              renderItem={({ item, drag, isActive }) => renderItem(item, drag, isActive)}
              onDragEnd={({ data }) => reorderItems.mutate({ listId: list.id, itemIds: reorderedIds(data) })}
            />
          ) : (
            visibleItems.map((item) => renderItem(item))
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
        </>
      )}

      <TripPickerSheet
        visible={pickingTrip}
        onClose={() => setPickingTrip(false)}
        onSelect={(tripId) => setTrip.mutate({ listId: list.id, tripId })}
      />
    </Card>
  );
}
