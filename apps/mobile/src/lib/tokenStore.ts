import * as SecureStore from "expo-secure-store";
import type { TokenStore } from "@travel/api-client";

const REFRESH_KEY = "travel_refresh_token";

/** Mobile has no cookie jar, so — unlike web's cookie-based InMemoryTokenStore —
 * the refresh token is persisted here in expo-secure-store, app-name-prefixed
 * (`travel_refresh_token`) to mirror Quest's `quest_refresh_token` convention. */
export class SecureStoreTokenStore implements TokenStore {
  private accessToken: string | null = null;

  getAccessToken(): string | null {
    return this.accessToken;
  }

  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }

  async getRefreshToken(): Promise<string | null> {
    return SecureStore.getItemAsync(REFRESH_KEY);
  }

  async setRefreshToken(token: string | null): Promise<void> {
    if (token) await SecureStore.setItemAsync(REFRESH_KEY, token);
    else await SecureStore.deleteItemAsync(REFRESH_KEY);
  }
}
