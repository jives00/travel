import { createTravelApi } from "@travel/api-client";
import { ProbingBaseUrlResolver } from "./apiBase";
import { SecureStoreTokenStore } from "./tokenStore";

export const tokenStore = new SecureStoreTokenStore();
// Exported so the connectivity manager can health-probe / reset it (the "is home
// reachable?" signal that drives onlineManager and the reconnect sync).
export const baseUrl = new ProbingBaseUrlResolver();

export const travelApi = createTravelApi({ baseUrl, tokenStore });
