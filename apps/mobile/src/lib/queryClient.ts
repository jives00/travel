import { QueryClient } from "@tanstack/react-query";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { PersistQueryClientOptions } from "@tanstack/react-query-persist-client";

/**
 * The mobile QueryClient is tuned for a device that may be offline for an entire
 * trip (home NAS powered off). Two departures from web defaults:
 *
 *  - `gcTime: Infinity` — inactive queries are never garbage-collected, so the
 *    whole primary-trip graph stays resident and is captured in every persisted
 *    snapshot. (Web can re-fetch on demand; a traveling phone cannot.)
 *  - queries `networkMode: "offlineFirst"` — always serve cached data first and
 *    only hit the network when we believe we're online, instead of hanging.
 *
 * Mutations keep the default `networkMode: "online"`: when the connectivity
 * manager reports offline, they *pause* (queue) rather than error, and resume on
 * reconnect. See `mutations.ts` for the offline write contract.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: Infinity,
      staleTime: 60_000,
      networkMode: "offlineFirst",
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      // Retry a couple of times for a transient blip; a real offline stretch
      // pauses the mutation instead (handled by onlineManager), so this retry
      // count only applies once we're actually online.
      retry: 2,
    },
  },
});

const persister = createAsyncStoragePersister({
  storage: AsyncStorage,
  // The persisted blob includes both the query cache and any *paused* mutations
  // (react-query dehydrates paused mutations by default). Throttle writes so a
  // burst of offline edits doesn't thrash storage.
  throttleTime: 1000,
});

export const persistOptions: Omit<PersistQueryClientOptions, "queryClient"> = {
  persister,
  // CRITICAL for the whole-trip-offline case: the default maxAge is 24h, after
  // which react-query DISCARDS the restored cache (and the queued mutations with
  // it) on cold start. A NAS-down trip lasts weeks — never expire the snapshot;
  // freshness is governed by refetch-on-reconnect, not by throwing data away.
  maxAge: Infinity,
  // Bump this string whenever a released schema change makes old persisted data
  // incompatible, to force a clean slate on that upgrade.
  buster: "v1",
};
