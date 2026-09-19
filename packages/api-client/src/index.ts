import { AuthManager } from "./authManager";
import type { BaseUrlResolver } from "./baseUrl";
import { createApiClient } from "./client";
import type { TokenStore } from "./tokenStore";

import { createAuthEndpoints } from "./endpoints/auth";
import { createPlacesEndpoints } from "./endpoints/places";
import { createTripsEndpoints } from "./endpoints/trips";
import { createItineraryEndpoints } from "./endpoints/itinerary";
import { createDayNotesEndpoints } from "./endpoints/dayNotes";
import { createTripLinksEndpoints } from "./endpoints/tripLinks";
import { createRecapEndpoints } from "./endpoints/recap";
import { createReadinessEndpoints } from "./endpoints/readiness";
import { createBookingsEndpoints } from "./endpoints/bookings";
import { createExpensesEndpoints } from "./endpoints/expenses";
import { createListsEndpoints } from "./endpoints/lists";
import { createSettingsEndpoints } from "./endpoints/settings";
import { createFundingSourcesEndpoints } from "./endpoints/fundingSources";
import { createMapEndpoints } from "./endpoints/map";
import { createGeoEndpoints } from "./endpoints/geo";
import { createWishlistEndpoints } from "./endpoints/wishlist";

import { createPlacesQueries } from "./queries/placesQuery";
import { createTripQueries } from "./queries/tripQuery";
import { createItineraryQueries } from "./queries/itineraryQuery";
import { createDayNotesQueries } from "./queries/dayNotesQuery";
import { createTripLinksQueries } from "./queries/tripLinksQuery";
import { createRecapQueries } from "./queries/recapQuery";
import { createReadinessQueries } from "./queries/readinessQuery";
import { createBookingsQueries } from "./queries/bookingsQuery";
import { createBudgetQueries } from "./queries/budgetQuery";
import { createListsQueries } from "./queries/listsQuery";
import { createSettingsQueries } from "./queries/settingsQuery";
import { createFundingSourcesQueries } from "./queries/fundingSourcesQuery";
import { createMapQueries } from "./queries/mapQuery";
import { createGeoQueries } from "./queries/geoQuery";
import { createWishlistQueries } from "./queries/wishlistQuery";

export * from "./client";
export * from "./loginError";
export * from "./tokenStore";
export * from "./baseUrl";
export { AuthManager, AuthRejectedError, NetworkUnreachableError } from "./authManager";
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
  const dayNotes = createDayNotesEndpoints(request);
  const tripLinks = createTripLinksEndpoints(request);
  const recap = createRecapEndpoints(request);
  const readiness = createReadinessEndpoints(request);
  const bookings = createBookingsEndpoints(request);
  const expenses = createExpensesEndpoints(request);
  const lists = createListsEndpoints(request);
  const settings = createSettingsEndpoints(request);
  const fundingSources = createFundingSourcesEndpoints(request);
  const map = createMapEndpoints(request);
  const geo = createGeoEndpoints(request);
  const wishlist = createWishlistEndpoints(request);

  return {
    authManager,
    auth,
    places,
    trips,
    itinerary,
    dayNotes,
    tripLinks,
    recap,
    readiness,
    bookings,
    expenses,
    lists,
    settings,
    fundingSources,
    map,
    geo,
    wishlist,
    queries: {
      ...createPlacesQueries(places),
      ...createTripQueries(trips),
      ...createItineraryQueries(itinerary),
      ...createDayNotesQueries(dayNotes),
      ...createTripLinksQueries(tripLinks),
      ...createRecapQueries(recap),
      ...createReadinessQueries(readiness),
      ...createBookingsQueries(bookings),
      ...createBudgetQueries(expenses),
      ...createListsQueries(lists),
      ...createSettingsQueries(settings),
      ...createFundingSourcesQueries(fundingSources),
      ...createMapQueries(map),
      ...createGeoQueries(geo),
      ...createWishlistQueries(wishlist),
    },
  };
}

export type TravelApi = ReturnType<typeof createTravelApi>;
