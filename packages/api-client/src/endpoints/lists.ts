import type { AddListItemBody, CreateListBody, ListWithItems } from "@travel/types";
import type { createApiClient } from "../client";

type RequestFn = ReturnType<typeof createApiClient>["request"];

export function createListsEndpoints(request: RequestFn) {
  return {
    list: (tripId?: number) => request<ListWithItems[]>("/api/lists", { query: { tripId } }),
    create: (body: CreateListBody) => request<ListWithItems>("/api/lists", { method: "POST", body }),
    rename: (listId: number, name: string) =>
      request<void>(`/api/lists/${listId}`, { method: "PATCH", body: { name } }),
    copy: (listId: number) => request<ListWithItems>(`/api/lists/${listId}/copy`, { method: "POST" }),
    reset: (listId: number) => request<void>(`/api/lists/${listId}/reset`, { method: "POST" }),
    addItem: (listId: number, body: AddListItemBody) =>
      request<void>(`/api/lists/${listId}/items`, { method: "POST", body }),
    setItemDone: (listId: number, itemId: number, done: boolean) =>
      request<void>(`/api/lists/${listId}/items/${itemId}`, { method: "PATCH", body: { done } }),
    removeItem: (listId: number, itemId: number) =>
      request<void>(`/api/lists/${listId}/items/${itemId}`, { method: "DELETE" }),
    reorderItems: (listId: number, itemIds: number[]) =>
      request<void>(`/api/lists/${listId}/items/reorder`, { method: "POST", body: { itemIds } }),
  };
}
