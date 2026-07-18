import { useMutation } from "@tanstack/react-query";
import type { ListItem, ListWithItems } from "@travel/types";
import { travelApi } from "../api";
import { queryClient } from "../queryClient";
import { nextTempId, registerOfflineMutation, resolveId } from "../mutations";

/**
 * Custom lists (the mobile Lists tab shows global lists — queryKey
 * ["lists","global"], matching web's /lists). All ops queue offline. A packing
 * list is a core travel use, so checking items off with the NAS down must work.
 *
 * Known limit: the API's addItem returns void (no new item id), so an item
 * *created* offline and then toggled/removed in the *same* offline session can't
 * have its temp id remapped on replay — the add syncs, that follow-up may not.
 * Items that already existed (real ids) toggle/remove perfectly offline.
 */

const KEY = ["lists", "global"] as const;

export const LIST_CREATE = ["lists", "create"] as const;
export const LIST_ADD_ITEM = ["lists", "addItem"] as const;
export const LIST_SET_ITEM_DONE = ["lists", "setItemDone"] as const;
export const LIST_REMOVE_ITEM = ["lists", "removeItem"] as const;
export const LIST_RENAME = ["lists", "rename"] as const;
export const LIST_COPY = ["lists", "copy"] as const;
export const LIST_RESET = ["lists", "reset"] as const;
export const LIST_REORDER = ["lists", "reorderItems"] as const;

function patchList(listId: number, fn: (l: ListWithItems) => ListWithItems): ListWithItems[] | undefined {
  const prev = queryClient.getQueryData<ListWithItems[]>(KEY);
  queryClient.setQueryData<ListWithItems[]>(KEY, (old) => old?.map((l) => (l.id === listId ? fn(l) : l)));
  return prev;
}

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
}

const invalidate = () => queryClient.invalidateQueries({ queryKey: ["lists"] });

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
    onMutate: ({ listId, text }) => {
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
    onMutate: ({ listId, itemId, done }) => {
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
    onMutate: ({ listId, itemId }) => {
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
    onMutate: ({ listId, name }) => ({ prev: patchList(listId, (l) => ({ ...l, name })) }),
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
  const c = ctx as { prev?: ListWithItems[] } | undefined;
  if (c?.prev) queryClient.setQueryData(KEY, c.prev);
}
