import { AuthManager } from "./authManager";
import type { BaseUrlResolver } from "./baseUrl";
import { createApiClient } from "./client";
import type { TokenStore } from "./tokenStore";

import { createAuthEndpoints } from "./endpoints/auth";
import { createPlacesEndpoints } from "./endpoints/places";
import { createTripsEndpoints } from "./endpoints/trips";
import { createItineraryEndpoints } from "./endpoints/itinerary";
import { createBookingsEndpoints } from "./endpoints/bookings";
import { createListsEndpoints } from "./endpoints/lists";
import { createSettingsEndpoints } from "./endpoints/settings";
import { createMapEndpoints } from "./endpoints/map";
import { createWishlistEndpoints } from "./endpoints/wishlist";

import { createPlacesQueries } from "./queries/placesQuery";
import { createTripQueries } from "./queries/tripQuery";
import { createItineraryQueries } from "./queries/itineraryQuery";
import { createBookingsQueries } from "./queries/bookingsQuery";
import { createListsQueries } from "./queries/listsQuery";
import { createSettingsQueries } from "./queries/settingsQuery";
import { createMapQueries } from "./queries/mapQuery";
import { createWishlistQueries } from "./queries/wishlistQuery";

export * from "./client";
export * from "./tokenStore";
export * from "./baseUrl";
export { AuthManager } from "./authManager";
export type { AutocompleteSuggestion, PlaceDetails } from "./endpoints/places";
export type { ListImageOption } from "./endpoints/trips";

export interface CreateTravelApiConfig {
  baseUrl: BaseUrlResolver;
  tokenStore: TokenStore;
}

/** The single entry point both platforms use: one client, one auth lifecycle,
 * every endpoint + its matching TanStack Query options, assembled from the two
 * injected platform differences (baseUrl resolution, token storage). */
export function createTravelApi(config: CreateTravelApiConfig) {
  const authManager = new AuthManager(config.baseUrl, config.tokenStore);

  const { request } = createApiClient({
    baseUrl: config.baseUrl,
    tokenStore: config.tokenStore,
    refreshAccessToken: () => authManager.refreshAccessToken(),
  });

  const auth = createAuthEndpoints(request);
  const places = createPlacesEndpoints(request);
  const trips = createTripsEndpoints(request);
  const itinerary = createItineraryEndpoints(request);
  const bookings = createBookingsEndpoints(request);
  const lists = createListsEndpoints(request);
  const settings = createSettingsEndpoints(request);
  const map = createMapEndpoints(request);
  const wishlist = createWishlistEndpoints(request);

  return {
    authManager,
    auth,
    places,
    trips,
    itinerary,
    bookings,
    lists,
    settings,
    map,
    wishlist,
    queries: {
      ...createPlacesQueries(places),
      ...createTripQueries(trips),
      ...createItineraryQueries(itinerary),
      ...createBookingsQueries(bookings),
      ...createListsQueries(lists),
      ...createSettingsQueries(settings),
      ...createMapQueries(map),
      ...createWishlistQueries(wishlist),
    },
  };
}

export type TravelApi = ReturnType<typeof createTravelApi>;
