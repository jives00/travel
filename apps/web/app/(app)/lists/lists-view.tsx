"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { travelApi } from "@/lib/api";
import { useHideDoneLists } from "@/lib/listPrefs";

// Kept in step with the `duration-200` fade on a completing row.
const FADE_MS = 200;

/** Which side of a hovered row/card the pointer is on, for the drop indicator. */
function isBeforeMidpoint(e: React.DragEvent<HTMLElement>, axis: "y" | "x") {
  const rect = e.currentTarget.getBoundingClientRect();
  return axis === "y"
    ? e.clientY < rect.top + rect.height / 2
    : e.clientX < rect.left + rect.width / 2;
}

/** Reorder `rows` to match `ids`, or leave them alone if the two disagree. */
function applyOrder<T extends { id: number }>(rows: T[], ids: number[]): T[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const ordered = ids.map((id) => byId.get(id)).filter((row): row is T => row !== undefined);
  return ordered.length === rows.length ? ordered : rows;
}

/** Move `draggedId` so it sits before/after `targetId` in `ids`. */
function moveInto(ids: number[], draggedId: number, targetId: number, before: boolean) {
  const rest = ids.filter((id) => id !== draggedId);
  const targetIndex = rest.indexOf(targetId);
  if (targetIndex === -1) return null;
  const insertAt = before ? targetIndex : targetIndex + 1;
  const reordered = [...rest.slice(0, insertAt), draggedId, ...rest.slice(insertAt)];
  return reordered.every((id, i) => id === ids[i]) ? null : reordered;
}

export function ListsView() {
  const queryClient = useQueryClient();
  const listsQuery = travelApi.queries.listsQuery();
  const { data: lists } = useQuery(listsQuery);
  type ListRow = NonNullable<typeof lists>[number];
  const { data: trips } = useQuery(travelApi.queries.tripsQuery());
  const [name, setName] = useState("");
  const [newListTripId, setNewListTripId] = useState("");
  const [creating, setCreating] = useState(false);
  const [itemText, setItemText] = useState<Record<number, string>>({});
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [dragItemId, setDragItemId] = useState<number | null>(null);
  const [dragListId, setDragListId] = useState<number | null>(null);
  // Where the dragged row/card would land: the row it's hovering and which side
  // of that row's midpoint the pointer is on. Drives the drop indicator line and
  // the insertion index, so what you see is exactly what the drop does.
  const [itemDropAt, setItemDropAt] = useState<{ itemId: number; before: boolean } | null>(null);
  const [listDropAt, setListDropAt] = useState<{ listId: number; before: boolean } | null>(null);
  // Checkbox state the server hasn't confirmed yet — the box ticks instantly and
  // the row fades before the refetch removes it.
  const [pendingDone, setPendingDone] = useState<Record<number, boolean>>({});
  const { hidesDone, toggleHideDone } = useHideDoneLists();
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editItemDraft, setEditItemDraft] = useState("");

  async function invalidate() {
    await queryClient.invalidateQueries({ queryKey: ["lists"] });
  }

  async function createList(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setCreating(true);
    try {
      // Global by default (no tripId) — a standing list spanning every trip,
      // same duality the place library itself has with its "this trip only" toggle.
      await travelApi.lists.create({ name: name.trim(), tripId: newListTripId ? Number(newListTripId) : undefined });
      await invalidate();
      setName("");
      setNewListTripId("");
    } finally {
      setCreating(false);
    }
  }

  async function setListTrip(listId: number, tripId: string) {
    await travelApi.lists.setTrip(listId, tripId ? Number(tripId) : null);
    await invalidate();
  }

  async function addItem(e: React.FormEvent, listId: number) {
    e.preventDefault();
    const text = (itemText[listId] ?? "").trim();
    if (!text) return;
    await travelApi.lists.addItem(listId, { text });
    setItemText((prev) => ({ ...prev, [listId]: "" }));
    await invalidate();
  }

  async function setItemDone(listId: number, itemId: number, done: boolean) {
    setPendingDone((prev) => ({ ...prev, [itemId]: done }));
    // While completed items are hidden, hold the row on screen long enough for
    // the fade to play — otherwise a fast API round-trip yanks it mid-animation.
    const fade = done && hidesDone(listId) ? new Promise((r) => setTimeout(r, FADE_MS)) : null;
    try {
      await Promise.all([
        (async () => {
          await travelApi.lists.setItemDone(listId, itemId, done);
          await invalidate();
        })(),
        fade,
      ]);
    } finally {
      setPendingDone((prev) => {
        const next = { ...prev };
        delete next[itemId];
        return next;
      });
    }
  }

  async function removeItem(listId: number, itemId: number) {
    await travelApi.lists.removeItem(listId, itemId);
    await invalidate();
  }

  function startEditItem(itemId: number, currentText: string) {
    setEditingItemId(itemId);
    setEditItemDraft(currentText);
  }

  async function submitEditItem(e: React.FormEvent, listId: number, itemId: number) {
    e.preventDefault();
    if (editingItemId !== itemId) return;
    const trimmed = editItemDraft.trim();
    setEditingItemId(null);
    if (!trimmed) return;
    await travelApi.lists.updateItemText(listId, itemId, trimmed);
    await invalidate();
  }

  async function copyList(listId: number) {
    await travelApi.lists.copy(listId);
    await invalidate();
  }

  async function resetList(listId: number, listName: string) {
    if (!window.confirm(`Uncheck every item in "${listName}"?`)) return;
    await travelApi.lists.reset(listId);
    await invalidate();
  }

  function startRename(listId: number, currentName: string) {
    setRenamingId(listId);
    setRenameDraft(currentName);
  }

  async function submitRename(e: React.FormEvent, listId: number) {
    e.preventDefault();
    if (renamingId !== listId) return;
    const trimmed = renameDraft.trim();
    setRenamingId(null);
    if (!trimmed) return;
    await travelApi.lists.rename(listId, trimmed);
    await invalidate();
  }

  async function dropItem(itemIds: number[], listId: number, targetItemId: number, before: boolean) {
    const draggedId = dragItemId;
    setDragItemId(null);
    setItemDropAt(null);
    if (draggedId === null || !itemIds.includes(draggedId)) return;
    const reordered = moveInto(itemIds, draggedId, targetItemId, before);
    if (!reordered) return;
    // Paint the new order now; the round-trip and refetch only confirm it. A
    // failure falls back to whatever the refetch returns.
    queryClient.setQueryData<ListRow[]>(listsQuery.queryKey, (prev) =>
      prev?.map((l) => (l.id === listId ? { ...l, items: applyOrder(l.items, reordered) } : l)),
    );
    await travelApi.lists.reorderItems(listId, reordered);
    await invalidate();
  }

  async function dropList(listIds: number[], targetListId: number, before: boolean) {
    const draggedId = dragListId;
    setDragListId(null);
    setListDropAt(null);
    if (draggedId === null || !listIds.includes(draggedId)) return;
    const reordered = moveInto(listIds, draggedId, targetListId, before);
    if (!reordered) return;
    queryClient.setQueryData<ListRow[]>(listsQuery.queryKey, (prev) => prev && applyOrder(prev, reordered));
    await travelApi.lists.reorderLists(reordered);
    await invalidate();
  }

  return (
    <div className="space-y-6">
      <form onSubmit={createList} className="flex flex-wrap gap-2">
        <input
          className="flex-1 rounded border border-gridline bg-transparent p-2 text-text-primary"
          placeholder="New list name (e.g. Packing list)…"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <select
          className="rounded border border-gridline bg-transparent p-2 text-sm text-text-primary"
          value={newListTripId}
          onChange={(e) => setNewListTripId(e.target.value)}
        >
          <option value="">No trip (global)</option>
          {(trips ?? []).map((trip) => (
            <option key={trip.id} value={trip.id}>
              {trip.name}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={creating}
          className="rounded bg-category-transit px-4 py-2 font-medium text-white disabled:opacity-50"
        >
          Create list
        </button>
      </form>

      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(lists ?? []).map((list) => {
          const hideDone = hidesDone(list.id);
          const isDone = (item: { id: number; done: boolean }) => pendingDone[item.id] ?? item.done;
          const doneCount = list.items.filter(isDone).length;
          // Reordering still works off the full item order even when completed
          // items are hidden, so a drag between two visible rows can't drop the
          // hidden ones out of the list. Items still awaiting confirmation stay
          // rendered so they can fade out rather than vanish.
          const visibleItems = hideDone
            ? list.items.filter((i) => !isDone(i) || i.id in pendingDone)
            : list.items;
          const listDrop = listDropAt?.listId === list.id ? listDropAt : null;
          return (
          <li
            key={list.id}
            draggable
            onDragStart={(e) => {
              setDragListId(list.id);
              e.dataTransfer.effectAllowed = "move";
              // Firefox refuses to start a drag without payload on the transfer.
              e.dataTransfer.setData("text/plain", `list:${list.id}`);
            }}
            onDragOver={(e) => {
              if (dragListId === null) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              const before = isBeforeMidpoint(e, "x");
              setListDropAt((prev) =>
                prev?.listId === list.id && prev.before === before ? prev : { listId: list.id, before },
              );
            }}
            onDragLeave={(e) => {
              // Crossing into a child still fires dragleave; ignore those or the
              // indicator strobes as the pointer moves across the card.
              if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
              setListDropAt((prev) => (prev?.listId === list.id ? null : prev));
            }}
            onDrop={(e) => {
              if (dragListId === null) return;
              e.preventDefault();
              dropList((lists ?? []).map((l) => l.id), list.id, isBeforeMidpoint(e, "x"));
            }}
            onDragEnd={() => {
              setDragListId(null);
              setListDropAt(null);
            }}
            className={`relative rounded border border-gridline bg-surface p-4 ${dragListId === list.id ? "opacity-40" : ""}`}
          >
            {listDrop && dragListId !== list.id && (
              <span
                aria-hidden
                className={`pointer-events-none absolute inset-y-0 w-1 rounded bg-category-transit ${
                  listDrop.before ? "-left-2" : "-right-2"
                }`}
              />
            )}
            <div className="mb-2 flex items-center justify-between gap-2">
              <div className="flex flex-1 items-center gap-2">
                <span className="cursor-grab select-none text-text-muted" title="Drag to reorder">
                  ⠿
                </span>
                {renamingId === list.id ? (
                  <form onSubmit={(e) => submitRename(e, list.id)} className="flex-1">
                    <input
                      autoFocus
                      className="w-full rounded border border-gridline bg-transparent p-1 font-medium text-text-primary"
                      value={renameDraft}
                      onChange={(e) => setRenameDraft(e.target.value)}
                      onBlur={(e) => submitRename(e, list.id)}
                    />
                  </form>
                ) : (
                  <h2
                    className="cursor-text font-medium text-text-primary"
                    onClick={() => startRename(list.id, list.name)}
                    title="Click to rename"
                  >
                    {list.name}
                  </h2>
                )}
              </div>
              <div className="flex items-center gap-3">
                {doneCount > 0 && (
                  <button
                    onClick={() => toggleHideDone(list.id)}
                    className="text-xs text-text-secondary hover:text-text-primary"
                    title={hideDone ? "Show completed items" : "Hide completed items"}
                  >
                    {hideDone ? `Show done (${doneCount})` : "Hide done"}
                  </button>
                )}
                <button
                  onClick={() => resetList(list.id, list.name)}
                  className="text-xs text-text-secondary hover:text-text-primary"
                >
                  Reset
                </button>
                <button
                  onClick={() => copyList(list.id)}
                  className="text-xs text-text-secondary hover:text-text-primary"
                >
                  Copy
                </button>
              </div>
            </div>
            <select
              className="mb-2 w-full rounded border border-gridline bg-transparent p-1 text-xs text-text-secondary"
              value={list.tripId ?? ""}
              onChange={(e) => setListTrip(list.id, e.target.value)}
            >
              <option value="">No trip (global)</option>
              {(trips ?? []).map((trip) => (
                <option key={trip.id} value={trip.id}>
                  {trip.name}
                </option>
              ))}
            </select>
            {/* No gaps between rows: a `space-y` gutter is dead space that swallows
                drops. Each row pads itself instead, so every pixel of the list
                belongs to some row. */}
            <ul className="mb-2">
              {visibleItems.map((item) => {
                const done = isDone(item);
                const fadingOut = hideDone && done && item.id in pendingDone;
                const itemDrop = itemDropAt?.itemId === item.id ? itemDropAt : null;
                return (
                <li
                  key={item.id}
                  draggable
                  onDragStart={(e) => {
                    // Without this the parent card's own dragstart fires too and a
                    // row drop would silently reorder the lists instead.
                    e.stopPropagation();
                    setDragItemId(item.id);
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData("text/plain", `item:${item.id}`);
                  }}
                  onDragOver={(e) => {
                    if (dragItemId === null || !list.items.some((i) => i.id === dragItemId)) return;
                    e.preventDefault();
                    e.stopPropagation();
                    e.dataTransfer.dropEffect = "move";
                    const before = isBeforeMidpoint(e, "y");
                    setItemDropAt((prev) =>
                      prev?.itemId === item.id && prev.before === before ? prev : { itemId: item.id, before },
                    );
                  }}
                  onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
                    setItemDropAt((prev) => (prev?.itemId === item.id ? null : prev));
                  }}
                  onDrop={(e) => {
                    if (dragItemId === null) return;
                    e.preventDefault();
                    e.stopPropagation();
                    dropItem(list.items.map((i) => i.id), list.id, item.id, isBeforeMidpoint(e, "y"));
                  }}
                  onDragEnd={(e) => {
                    e.stopPropagation();
                    setDragItemId(null);
                    setItemDropAt(null);
                  }}
                  className={`relative flex items-center justify-between py-1 text-base text-text-primary transition-opacity duration-200 ${
                    fadingOut ? "opacity-0" : dragItemId === item.id ? "opacity-40" : ""
                  }`}
                >
                  {itemDrop && dragItemId !== item.id && (
                    <span
                      aria-hidden
                      className={`pointer-events-none absolute inset-x-0 h-0.5 rounded bg-category-transit ${
                        itemDrop.before ? "top-0" : "bottom-0"
                      }`}
                    />
                  )}
                  <div className="flex flex-1 items-center gap-2">
                    <span className="cursor-grab select-none text-text-muted">⠿</span>
                    <input
                      type="checkbox"
                      aria-label={`Mark "${item.text}" done`}
                      checked={done}
                      onChange={(e) => setItemDone(list.id, item.id, e.target.checked)}
                      className="h-5 w-5 accent-category-transit"
                    />
                    {editingItemId === item.id ? (
                      <form onSubmit={(e) => submitEditItem(e, list.id, item.id)} className="flex-1">
                        <input
                          autoFocus
                          className="w-full rounded border border-gridline bg-transparent p-1 text-base text-text-primary"
                          value={editItemDraft}
                          onChange={(e) => setEditItemDraft(e.target.value)}
                          onBlur={(e) => submitEditItem(e, list.id, item.id)}
                        />
                      </form>
                    ) : (
                      <span
                        className={`flex-1 cursor-text ${done ? "text-text-muted line-through" : ""}`}
                        onClick={() => startEditItem(item.id, item.text)}
                        title="Click to edit"
                      >
                        {item.text}
                      </span>
                    )}
                  </div>
                  <button
                    onClick={() => removeItem(list.id, item.id)}
                    className="text-text-muted hover:text-status-critical"
                  >
                    ✕
                  </button>
                </li>
                );
              })}
              {list.items.length === 0 && <p className="text-sm text-text-muted">No items yet.</p>}
              {list.items.length > 0 && visibleItems.length === 0 && (
                <p className="text-sm text-text-muted">All {doneCount} items done.</p>
              )}
            </ul>
            <form onSubmit={(e) => addItem(e, list.id)} className="flex gap-2">
              <input
                className="flex-1 rounded border border-gridline bg-transparent p-1 text-xs text-text-primary"
                placeholder="Add an item…"
                value={itemText[list.id] ?? ""}
                onChange={(e) => setItemText((prev) => ({ ...prev, [list.id]: e.target.value }))}
              />
              <button type="submit" className="rounded border border-gridline px-2 text-xs text-text-secondary">
                Add
              </button>
            </form>
          </li>
          );
        })}
        {(lists ?? []).length === 0 && <p className="text-text-muted">No custom lists yet.</p>}
      </ul>
    </div>
  );
}
