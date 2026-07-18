import { useEffect, useState } from "react";
import { onlineManager } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { colorScheme } from "nativewind";
import "./global.css";

import { AuthProvider } from "./src/contexts/AuthContext";
import { RootNavigator } from "./src/navigation";
import { queryClient, persistOptions } from "./src/lib/queryClient";
import { startConnectivityManager } from "./src/lib/connectivity";
import { loadTempIdCounter, resumeQueuedMutations } from "./src/lib/mutations";
// Imported for its side effect: registers every offline mutation's default
// behavior (setMutationDefaults) so paused mutations can replay after a cold
// start. Feature phases add their registrations to this module.
import "./src/lib/mutationRegistry";

const THEME_KEY = "theme";

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Mobile defaults to light (outdoor/direct-sun readability) unless the user
    // has explicitly switched to dark — the opposite default from web. NativeWind's
    // colorScheme otherwise follows the system setting, which we don't want here.
    void (async () => {
      const [stored] = await Promise.all([AsyncStorage.getItem(THEME_KEY), loadTempIdCounter()]);
      colorScheme.set(stored === "dark" ? "dark" : "light");
      // Wire NetInfo + NAS-reachability into onlineManager before the tree mounts,
      // so the first render already reflects real connectivity.
      startConnectivityManager();
      setReady(true);
    })();
  }, []);

  // Whenever connectivity flips back to online, drain the queued offline edits.
  // (react-query resumes paused mutations on its own online transition too, but
  // we go through resumeQueuedMutations so the temp-id map is loaded first.)
  useEffect(() => {
    return onlineManager.subscribe((online) => {
      if (online) void resumeQueuedMutations();
    });
  }, []);

  if (!ready) return null;

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={persistOptions}
      // Fires once the persisted cache (and any queued mutations) has been
      // restored on cold start — the safe point to drain the queue if we happen
      // to already be online.
      onSuccess={() => {
        if (onlineManager.isOnline()) void resumeQueuedMutations();
      }}
    >
      <SafeAreaProvider>
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </SafeAreaProvider>
    </PersistQueryClientProvider>
  );
}
