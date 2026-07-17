import { createTravelApi } from "@travel/api-client";
import { ProbingBaseUrlResolver } from "./apiBase";
import { SecureStoreTokenStore } from "./tokenStore";

export const tokenStore = new SecureStoreTokenStore();
const baseUrl = new ProbingBaseUrlResolver();

export const travelApi = createTravelApi({ baseUrl, tokenStore });
