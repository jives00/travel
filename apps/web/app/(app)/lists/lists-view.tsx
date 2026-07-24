"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { travelApi } from "@/lib/api";

export function ListsView() {
  const queryClient = useQueryClient();
  const { data: lists } = useQuery(travelApi.queries.listsQuery());
  const { data: trips } = useQuery(travelApi.queries.tripsQuery());
  const [name, setName] = useState("");
  const [newListTripId, setNewListTripId] = useState("");
  const [creating, setCreating] = useState(false);
  const [itemText, setItemText] = useState<Record<number, string>>({});
  const [renamingId, setRenamingId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [dragItemId, setDragItemId] = useState<number | null>(null);
  const [dragListId, setDragListId] = useState<number | null>(null);
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
    await travelApi.lists.setItemDone(listId, itemId, done);
    await invalidate();
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

  async function dropItem(itemIds: number[], listId: number, targetItemId: number) {
    const draggedId = dragItemId;
    setDragItemId(null);
    if (draggedId === null || draggedId === targetItemId) return;
    const withoutDragged = itemIds.filter((id) => id !== draggedId);
    const targetIndex = withoutDragged.indexOf(targetItemId);
    const reordered = [
      ...withoutDragged.slice(0, targetIndex),
      draggedId,
      ...withoutDragged.slice(targetIndex),
    ];
    await travelApi.lists.reorderItems(listId, reordered);
    await invalidate();
  }

  async function dropList(listIds: number[], targetListId: number) {
    const draggedId = dragListId;
    setDragListId(null);
    if (draggedId === null || draggedId === targetListId) return;
    const withoutDragged = listIds.filter((id) => id !== draggedId);
    const targetIndex = withoutDragged.indexOf(targetListId);
    const reordered = [
      ...withoutDragged.slice(0, targetIndex),
      draggedId,
      ...withoutDragged.slice(targetIndex),
    ];
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
        {(lists ?? []).map((list) => (
          <li
            key={list.id}
            draggable
            onDragStart={() => setDragListId(list.id)}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              dropList((lists ?? []).map((l) => l.id), list.id);
            }}
            onDragEnd={() => setDragListId(null)}
            className={`rounded border border-gridline bg-surface p-4 ${dragListId === list.id ? "opacity-40" : ""}`}
          >
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
            <ul className="mb-2 space-y-2">
              {list.items.map((item) => (
                <li
                  key={item.id}
                  draggable
                  onDragStart={() => setDragItemId(item.id)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    dropItem(list.items.map((i) => i.id), list.id, item.id);
                  }}
                  onDragEnd={() => setDragItemId(null)}
                  className={`flex items-center justify-between text-base text-text-primary ${
                    dragItemId === item.id ? "opacity-40" : ""
                  }`}
                >
                  <label className="flex flex-1 items-center gap-2">
                    <span className="cursor-grab select-none text-text-muted">⠿</span>
                    <input
                      type="checkbox"
                      checked={item.done}
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
                        className={`cursor-text ${item.done ? "text-text-muted line-through" : ""}`}
                        onClick={() => startEditItem(item.id, item.text)}
                        title="Click to edit"
                      >
                        {item.text}
                      </span>
                    )}
                  </label>
                  <button
                    onClick={() => removeItem(list.id, item.id)}
                    className="text-text-muted hover:text-status-critical"
                  >
                    ✕
                  </button>
                </li>
              ))}
              {list.items.length === 0 && <p className="text-sm text-text-muted">No items yet.</p>}
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
        ))}
        {(lists ?? []).length === 0 && <p className="text-text-muted">No custom lists yet.</p>}
      </ul>
    </div>
  );
}
