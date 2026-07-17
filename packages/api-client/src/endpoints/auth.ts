import type { LoginBody, LoginResponse } from "@travel/types";
import type { createApiClient } from "../client";

type RequestFn = ReturnType<typeof createApiClient>["request"];

export function createAuthEndpoints(request: RequestFn) {
  return {
    login: (body: LoginBody) => request<LoginResponse>("/api/auth/login", { method: "POST", body }),
    logout: () => request<void>("/api/auth/logout", { method: "POST" }),
  };
}
