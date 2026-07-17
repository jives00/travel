/** The other genuine platform difference: web keeps the access token in memory only
 * (refresh token lives in an httpOnly cookie, never touched by JS); mobile persists
 * both in expo-secure-store since there's no cookie jar. */
export interface TokenStore {
  getAccessToken(): string | null;
  setAccessToken(token: string | null): void;
  getRefreshToken(): Promise<string | null>;
  setRefreshToken(token: string | null): Promise<void>;
}

/** Web's store — access token in a module-level variable, refresh token is a no-op
 * (the httpOnly `travel_refreshToken` cookie is sent automatically via `credentials: "include"`). */
export class InMemoryTokenStore implements TokenStore {
  private accessToken: string | null = null;

  getAccessToken(): string | null {
    return this.accessToken;
  }
  setAccessToken(token: string | null): void {
    this.accessToken = token;
  }
  async getRefreshToken(): Promise<string | null> {
    return null;
  }
  async setRefreshToken(): Promise<void> {
    // no-op on web — the cookie is the refresh token
  }
}
