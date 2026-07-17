import type { Settings, UpdateSettingsBody } from "@travel/types";
import type { createApiClient } from "../client";

type RequestFn = ReturnType<typeof createApiClient>["request"];

export function createSettingsEndpoints(request: RequestFn) {
  return {
    get: () => request<Settings>("/api/settings"),
    update: (body: UpdateSettingsBody) => request<Settings>("/api/settings", { method: "PATCH", body }),
  };
}
