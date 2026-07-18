import { useMutation } from "@tanstack/react-query";
import type { CreateWishlistLocationBody, WishlistLocation } from "@travel/types";
import { travelApi } from "../api";
import { queryClient } from "../queryClient";
import { nextTempId, registerOfflineMutation } from "../mutations";

export const WISHLIST_CREATE = ["wishlist", "create"] as const;
export const WISHLIST_REMOVE = ["wishlist", "remove"] as const;

export function registerWishlistMutations(): void {
  registerOfflineMutation<CreateWishlistLocationBody & { tempId: number }, WishlistLocation>({
    mutationKey: WISHLIST_CREATE,
    mutationFn: ({ tempId: _t, ...body }) => travelApi.wishlist.create(body),
    tempIdOf: (v) => v.tempId,
    realIdOf: (w) => w.id,
  });
  registerOfflineMutation<{ id: number }, void>({
    mutationKey: WISHLIST_REMOVE,
    mutationFn: ({ id }) => travelApi.wishlist.remove(id),
  });
}

const invalidate = () => {
  queryClient.invalidateQueries({ queryKey: ["wishlist"] });
  queryClient.invalidateQueries({ queryKey: ["map", "overview"] });
};

export function useCreateWishlist() {
  const m = useMutation<WishlistLocation, Error, CreateWishlistLocationBody & { tempId: number }>({
    mutationKey: WISHLIST_CREATE,
    onSettled: invalidate,
  });
  return { ...m, create: (body: CreateWishlistLocationBody) => m.mutate({ ...body, tempId: nextTempId() }) };
}

export function useRemoveWishlist() {
  return useMutation<void, Error, { id: number }>({ mutationKey: WISHLIST_REMOVE, onSettled: invalidate });
}
