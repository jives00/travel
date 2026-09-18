import type { CreateTripLinkBody, TripLink, UpdateTripLinkBody } from "@travel/types";
import type { createApiClient } from "../client";

type RequestFn = ReturnType<typeof createApiClient>["request"];

export function createTripLinksEndpoints(request: RequestFn) {
  return {
    list: (tripId: number) => request<TripLink[]>(`/api/trips/${tripId}/links`),
    create: (tripId: number, body: CreateTripLinkBody) =>
      request<TripLink>(`/api/trips/${tripId}/links`, { method: "POST", body }),
    update: (tripId: number, linkId: number, body: UpdateTripLinkBody) =>
      request<TripLink>(`/api/trips/${tripId}/links/${linkId}`, { method: "PATCH", body }),
    remove: (tripId: number, linkId: number) =>
      request<void>(`/api/trips/${tripId}/links/${linkId}`, { method: "DELETE" }),
    /** Upload (or replace) the thumbnail — the only way a link gets one. Takes a
     * ready-made FormData so each platform can append whatever its runtime calls
     * a file (a `File` on web, a `{ uri, name, type }` shape on RN). */
    uploadImage: (tripId: number, linkId: number, formData: FormData) =>
      request<TripLink>(`/api/trips/${tripId}/links/${linkId}/image`, { method: "POST", formData }),
  };
}
