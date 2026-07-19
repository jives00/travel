/**
 * Central registration of every offline-capable mutation's default behavior.
 *
 * Importing this module (done once in App.tsx, before the first render/resume)
 * runs `registerOfflineMutation(...)` for each domain so that a mutation queued
 * while offline can replay after a cold start — the persisted mutation only
 * carries its `mutationKey` + variables, so the function to execute it must be
 * re-attached by key here at startup.
 *
 * Feature phases add their registrations here (or in a per-domain file imported
 * here), e.g.:
 *
 *   registerOfflineMutation({
 *     mutationKey: ["places", "create"],
 *     mutationFn: (vars) => travelApi.places.create(vars),
 *     tempIdOf: (vars) => vars.tempId,
 *     realIdOf: (place) => place.id,
 *   });
 *
 * Kept as a standalone aggregation module so App.tsx has a single stable import
 * and each phase touches only its own registration block.
 */

import { registerTripMutations } from "./offlineMutations/trips";
import { registerSettingsMutations } from "./offlineMutations/settings";
import { registerListMutations } from "./offlineMutations/lists";
import { registerPlaceMutations } from "./offlineMutations/places";
import { registerItineraryMutations } from "./offlineMutations/itinerary";
import { registerBookingMutations } from "./offlineMutations/bookings";
import { registerExpenseMutations } from "./offlineMutations/expenses";
import { registerWishlistMutations } from "./offlineMutations/wishlist";

// Phase B — Trips
registerTripMutations();
// Phase G — Settings
registerSettingsMutations();
// Phase F — Lists
registerListMutations();
// Phase C — Places
registerPlaceMutations();
// Phase D — Itinerary + Bookings
registerItineraryMutations();
registerBookingMutations();
// Phase H — Budget
registerExpenseMutations();
// Phase E — Wishlist (map overview)
registerWishlistMutations();

export {};
