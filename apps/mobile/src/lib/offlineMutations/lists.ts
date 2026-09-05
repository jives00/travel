import { useMutation } from "@tanstack/react-query";
import type { ListItem, ListWithItems } from "@travel/types";
import { travelApi } from "../api";
import { queryClient } from "../queryClient";
import { nextTempId, registerOfflineMutation, resolveId } from "../mutations";

/**
 * Custom lists. The Lists tab shows global lists (queryKey ["lists","global"],
 * matching web's /lists); a trip's Lists sheet shows that trip's (["lists",
 * tripId]) — optimistic writes touch both, so KEY is the shared prefix. All ops
 * queue offline. A packing list is a core travel use, so checking items off with
 * the NAS down must work.
 *
 * Known limit: the API's addItem returns void (no new item id), so an item
 * *created* offline and then toggled/removed in the *same* offline session can't
 * have its temp id remapped on replay — the add syncs, that follow-up may not.
 * Items that already existed (real ids) toggle/remove perfectly offline.
 */

const KEY = ["lists"] as const;

export const LIST_CREATE = ["lists", "create"] as const;
export const LIST_ADD_ITEM = ["lists", "addItem"] as const;
export const LIST_SET_ITEM_DONE = ["lists", "setItemDone"] as const;
export const LIST_REMOVE_ITEM = ["lists", "removeItem"] as const;
export const LIST_RENAME = ["lists", "rename"] as const;
export const LIST_COPY = ["lists", "copy"] as const;
export const LIST_RESET = ["lists", "reset"] as const;
export const LIST_REORDER = ["lists", "reorderItems"] as const;
export const LIST_REORDER_LISTS = ["lists", "reorderLists"] as const;
export const LIST_UPDATE_ITEM_TEXT = ["lists", "updateItemText"] as const;
export const LIST_SET_TRIP = ["lists", "setTrip"] as const;

/** Snapshot of every cached lists query, for rollback. */
type ListsSnapshot = [readonly unknown[], ListWithItems[] | undefined][];

/**
 * Patch the list in *every* cached lists query, not just the global one — the
 * Lists tab caches ["lists","global"] while a trip's Lists sheet caches
 * ["lists",tripId], and the same ListCard drives both.
 */
function patchList(listId: number, fn: (l: ListWithItems) => ListWithItems): ListsSnapshot {
  const prev = queryClient.getQueriesData<ListWithItems[]>({ queryKey: KEY });
  queryClient.setQueriesData<ListWithItems[]>({ queryKey: KEY }, (old) =>
    old?.map((l) => (l.id === listId ? fn(l) : l)),
  );
  return prev;
}

/** Stop any GET that's already in flight before writing an optimistic value.
 * A fetch started *before* the write resolves *after* it and would otherwise
 * write pre-write rows over the optimistic ones — the "it ticks, then flips
 * back a few seconds later" bug. react-query dedupes, so the invalidate in
 * onSettled would reuse that same stale fetch rather than correcting it. */
const cancel = () => queryClient.cancelQueries({ queryKey: KEY });

export function registerListMutations(): void {
  registerOfflineMutation<{ name: string; tripId?: number; tempId: number }, ListWithItems>({
    mutationKey: LIST_CREATE,
    mutationFn: ({ name, tripId }) => travelApi.lists.create({ name, tripId }),
    tempIdOf: (v) => v.tempId,
    realIdOf: (list) => list.id,
  });
  registerOfflineMutation<{ listId: number; text: string }, void>({
    mutationKey: LIST_ADD_ITEM,
    resolveRefs: (v) => ({ ...v, listId: resolveId(v.listId) }),
    mutationFn: ({ listId, text }) => travelApi.lists.addItem(listId, { text }),
  });
  registerOfflineMutation<{ listId: number; itemId: number; done: boolean }, void>({
    mutationKey: LIST_SET_ITEM_DONE,
    resolveRefs: (v) => ({ ...v, listId: resolveId(v.listId), itemId: resolveId(v.itemId) }),
    mutationFn: ({ listId, itemId, done }) => travelApi.lists.setItemDone(listId, itemId, done),
  });
  registerOfflineMutation<{ listId: number; itemId: number }, void>({
    mutationKey: LIST_REMOVE_ITEM,
    resolveRefs: (v) => ({ ...v, listId: resolveId(v.listId), itemId: resolveId(v.itemId) }),
    mutationFn: ({ listId, itemId }) => travelApi.lists.removeItem(listId, itemId),
  });
  registerOfflineMutation<{ listId: number; name: string }, void>({
    mutationKey: LIST_RENAME,
    resolveRefs: (v) => ({ ...v, listId: resolveId(v.listId) }),
    mutationFn: ({ listId, name }) => travelApi.lists.rename(listId, name),
  });
  registerOfflineMutation<{ listId: number }, ListWithItems>({
    mutationKey: LIST_COPY,
    resolveRefs: (v) => ({ listId: resolveId(v.listId) }),
    mutationFn: ({ listId }) => travelApi.lists.copy(listId),
  });
  registerOfflineMutation<{ listId: number }, void>({
    mutationKey: LIST_RESET,
    resolveRefs: (v) => ({ listId: resolveId(v.listId) }),
    mutationFn: ({ listId }) => travelApi.lists.reset(listId),
  });
  registerOfflineMutation<{ listId: number; itemIds: number[] }, void>({
    mutationKey: LIST_REORDER,
    resolveRefs: (v) => ({ listId: resolveId(v.listId), itemIds: v.itemIds.map(resolveId) }),
    mutationFn: ({ listId, itemIds }) => travelApi.lists.reorderItems(listId, itemIds),
  });
  registerOfflineMutation<{ listIds: number[] }, void>({
    mutationKey: LIST_REORDER_LISTS,
    resolveRefs: (v) => ({ listIds: v.listIds.map(resolveId) }),
    mutationFn: ({ listIds }) => travelApi.lists.reorderLists(listIds),
  });
  registerOfflineMutation<{ listId: number; itemId: number; text: string }, void>({
    mutationKey: LIST_UPDATE_ITEM_TEXT,
    resolveRefs: (v) => ({ ...v, listId: resolveId(v.listId), itemId: resolveId(v.itemId) }),
    mutationFn: ({ listId, itemId, text }) => travelApi.lists.updateItemText(listId, itemId, text),
  });
  registerOfflineMutation<{ listId: number; tripId: number | null }, void>({
    mutationKey: LIST_SET_TRIP,
    resolveRefs: (v) => ({ ...v, listId: resolveId(v.listId) }),
    mutationFn: ({ listId, tripId }) => travelApi.lists.setTrip(listId, tripId),
  });
}

const invalidate = () => queryClient.invalidateQueries({ queryKey: KEY });

export function useCreateList() {
  const m = useMutation<ListWithItems, Error, { name: string; tripId?: number; tempId: number }>({
    mutationKey: LIST_CREATE,
    onSettled: invalidate,
  });
  return { ...m, create: (name: string, tripId?: number) => m.mutate({ name, tripId, tempId: nextTempId() }) };
}

export function useAddItem() {
  const m = useMutation<void, Error, { listId: number; text: string }>({
    mutationKey: LIST_ADD_ITEM,
    onMutate: async ({ listId, text }) => {
      await cancel();
      const item: ListItem = {
        id: nextTempId(),
        listId,
        text,
        done: false,
        sortOrder: 9999,
        createdAt: new Date().toISOString(),
      };
      const prev = patchList(listId, (l) => ({ ...l, items: [...l.items, item] }));
      return { prev };
    },
    onError: (_e, _v, ctx) => restore(ctx),
    onSettled: invalidate,
  });
  return { ...m, add: (listId: number, text: string) => m.mutate({ listId, text }) };
}

export function useSetItemDone() {
  return useMutation<void, Error, { listId: number; itemId: number; done: boolean }>({
    mutationKey: LIST_SET_ITEM_DONE,
    onMutate: async ({ listId, itemId, done }) => {
      await cancel();
      const prev = patchList(listId, (l) => ({
        ...l,
        items: l.items.map((it) => (it.id === itemId ? { ...it, done } : it)),
      }));
      return { prev };
    },
    onError: (_e, _v, ctx) => restore(ctx),
    onSettled: invalidate,
  });
}

export function useRemoveItem() {
  return useMutation<void, Error, { listId: number; itemId: number }>({
    mutationKey: LIST_REMOVE_ITEM,
    onMutate: async ({ listId, itemId }) => {
      await cancel();
      const prev = patchList(listId, (l) => ({ ...l, items: l.items.filter((it) => it.id !== itemId) }));
      return { prev };
    },
    onError: (_e, _v, ctx) => restore(ctx),
    onSettled: invalidate,
  });
}

export function useRenameList() {
  return useMutation<void, Error, { listId: number; name: string }>({
    mutationKey: LIST_RENAME,
    onMutate: async ({ listId, name }) => {
      await cancel();
      return { prev: patchList(listId, (l) => ({ ...l, name })) };
    },
    onError: (_e, _v, ctx) => restore(ctx),
    onSettled: invalidate,
  });
}

export function useUpdateItemText() {
  return useMutation<void, Error, { listId: number; itemId: number; text: string }>({
    mutationKey: LIST_UPDATE_ITEM_TEXT,
    onMutate: async ({ listId, itemId, text }) => {
      await cancel();
      const prev = patchList(listId, (l) => ({
        ...l,
        items: l.items.map((it) => (it.id === itemId ? { ...it, text } : it)),
      }));
      return { prev };
    },
    onError: (_e, _v, ctx) => restore(ctx),
    onSettled: invalidate,
  });
}

export function useSetTrip() {
  return useMutation<void, Error, { listId: number; tripId: number | null }>({
    mutationKey: LIST_SET_TRIP,
    onMutate: async ({ listId, tripId }) => {
      await cancel();
      return { prev: patchList(listId, (l) => ({ ...l, tripId })) };
    },
    onError: (_e, _v, ctx) => restore(ctx),
    onSettled: invalidate,
  });
}

export function useReorderLists() {
  return useMutation<void, Error, { listIds: number[] }>({
    mutationKey: LIST_REORDER_LISTS,
    onMutate: async ({ listIds }) => {
      await cancel();
      const prev = queryClient.getQueriesData<ListWithItems[]>({ queryKey: KEY });
      queryClient.setQueriesData<ListWithItems[]>({ queryKey: KEY }, (old) => {
        if (!old) return old;
        const byId = new Map(old.map((l) => [l.id, l]));
        // A trip-scoped cache holds a subset of listIds — keep only what it has.
        const ordered = listIds.map((id) => byId.get(id)).filter((l): l is ListWithItems => !!l);
        return ordered.length === old.length ? ordered : old;
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => restore(ctx),
    onSettled: invalidate,
  });
}

export function useReorderItems() {
  return useMutation<void, Error, { listId: number; itemIds: number[] }>({
    mutationKey: LIST_REORDER,
    onMutate: async ({ listId, itemIds }) => {
      await cancel();
      const prev = patchList(listId, (l) => {
        const byId = new Map(l.items.map((i) => [i.id, i]));
        return { ...l, items: itemIds.map((id) => byId.get(id)).filter((i): i is ListItem => !!i) };
      });
      return { prev };
    },
    onError: (_e, _v, ctx) => restore(ctx),
    onSettled: invalidate,
  });
}

export function useCopyList() {
  return useMutation<ListWithItems, Error, { listId: number }>({ mutationKey: LIST_COPY, onSettled: invalidate });
}
export function useResetList() {
  return useMutation<void, Error, { listId: number }>({ mutationKey: LIST_RESET, onSettled: invalidate });
}

function restore(ctx: unknown) {
  const c = ctx as { prev?: ListsSnapshot } | undefined;
  for (const [key, data] of c?.prev ?? []) queryClient.setQueryData(key, data);
}
