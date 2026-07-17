import type { CreateWishlistLocationBody, WishlistLocation } from "@travel/types";
import type { createApiClient } from "../client";

type RequestFn = ReturnType<typeof createApiClient>["request"];

export function createWishlistEndpoints(request: RequestFn) {
  return {
    list: () => request<WishlistLocation[]>("/api/wishlist"),
    create: (body: CreateWishlistLocationBody) =>
      request<WishlistLocation>("/api/wishlist", { method: "POST", body }),
    remove: (id: number) => request<void>(`/api/wishlist/${id}`, { method: "DELETE" }),
  };
}
