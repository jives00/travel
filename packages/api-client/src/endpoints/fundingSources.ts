import type { CreateFundingSourceBody, FundingSource, UpdateFundingSourceBody } from "@travel/types";
import type { createApiClient } from "../client";

type RequestFn = ReturnType<typeof createApiClient>["request"];

/** User-scoped, not trip-scoped — the same card pays for every trip. */
export function createFundingSourcesEndpoints(request: RequestFn) {
  return {
    list: () => request<FundingSource[]>("/api/funding-sources"),
    create: (body: CreateFundingSourceBody) =>
      request<FundingSource>("/api/funding-sources", { method: "POST", body }),
    update: (id: number, body: UpdateFundingSourceBody) =>
      request<FundingSource>(`/api/funding-sources/${id}`, { method: "PATCH", body }),
    remove: (id: number) => request<void>(`/api/funding-sources/${id}`, { method: "DELETE" }),
  };
}
