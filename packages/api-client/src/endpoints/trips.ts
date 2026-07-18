import type {
  CreateLegBody,
  CreateTripBody,
  Leg,
  ReorderLegsBody,
  SelectListImageBody,
  Trip,
  UpdateLegBody,
  UpdateTripBody,
} from "@travel/types";
import type { createApiClient } from "../client";

type RequestFn = ReturnType<typeof createApiClient>["request"];

export interface ListImageOption {
  url: string;
  photographerName: string;
  photographerUrl: string;
  downloadLocation: string;
}

export function createTripsEndpoints(request: RequestFn) {
  return {
    list: (options?: { archived?: boolean }) =>
      request<Trip[]>("/api/trips", { query: { archived: options?.archived } }),
    get: (id: number) => request<Trip>(`/api/trips/${id}`),
    heroImage: (id: number) =>
      request<{
        url: string | null;
        city: string | null;
        photographerName: string | null;
        photographerUrl: string | null;
      }>(`/api/trips/${id}/hero-image`),
    // Persists the pick into list_image_url — distinct from heroImage() above,
    // which never saves. Used for the trips-list grid's fixed thumbnail.
    listImage: (id: number) => request<Trip>(`/api/trips/${id}/list-image`, { method: "POST" }),
    listImageOptions: (id: number) =>
      request<{ city: string | null; options: ListImageOption[] }>(`/api/trips/${id}/list-image-options`),
    selectListImage: (id: number, body: SelectListImageBody) =>
      request<Trip>(`/api/trips/${id}/list-image/select`, { method: "POST", body }),
    weather: (id: number) =>
      request<{
        city: string | null;
        days: { date: string; tempMaxF: number; tempMinF: number; condition: string; city: string }[];
      }>(`/api/trips/${id}/weather`),
    create: (body: CreateTripBody) => request<Trip>("/api/trips", { method: "POST", body }),
    update: (id: number, body: UpdateTripBody) =>
      request<Trip>(`/api/trips/${id}`, { method: "PATCH", body }),
    archive: (id: number) => request<void>(`/api/trips/${id}/archive`, { method: "POST" }),
    restore: (id: number) => request<void>(`/api/trips/${id}/restore`, { method: "POST" }),
    setPrimary: (id: number) => request<Trip>(`/api/trips/${id}/primary`, { method: "POST" }),
    clearPrimary: (id: number) => request<Trip>(`/api/trips/${id}/primary/clear`, { method: "POST" }),
    addLeg: (tripId: number, body: CreateLegBody) =>
      request<Leg>(`/api/trips/${tripId}/legs`, { method: "POST", body }),
    updateLeg: (tripId: number, legId: number, body: UpdateLegBody) =>
      request<Leg>(`/api/trips/${tripId}/legs/${legId}`, { method: "PATCH", body }),
    deleteLeg: (tripId: number, legId: number) =>
      request<void>(`/api/trips/${tripId}/legs/${legId}`, { method: "DELETE" }),
    reorderLegs: (tripId: number, body: ReorderLegsBody) =>
      request<Leg[]>(`/api/trips/${tripId}/legs/reorder`, { method: "POST", body }),
  };
}
