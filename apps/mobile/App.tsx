import { useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";
import { onlineManager } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { colorScheme } from "nativewind";
import "./global.css";

import { AuthProvider } from "./src/contexts/AuthContext";
import { RootNavigator } from "./src/navigation";
import { queryClient, persistOptions } from "./src/lib/queryClient";
import { startConnectivityManager } from "./src/lib/connectivity";
import { loadTempIdCounter, resumeQueuedMutations } from "./src/lib/mutations";
import UpdateBanner from "./src/components/UpdateBanner";
import { ErrorBoundary } from "./src/components/ErrorBoundary";
import { useUpdateStore } from "./src/store/update";
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
      // Every step here is best-effort: `ready` gates the entire tree, so a
      // rejection would render nothing at all, forever. Theme and temp-id
      // counter both have working defaults — losing them is cosmetic, whereas
      // not mounting is fatal.
      try {
        const [stored] = await Promise.all([AsyncStorage.getItem(THEME_KEY), loadTempIdCounter()]);
        colorScheme.set(stored === "dark" ? "dark" : "light");
      } catch (err) {
        console.error("[App] storage init failed, using defaults", err);
        colorScheme.set("light");
      }
      // Separate try: connectivity must be wired even if storage failed above,
      // or onlineManager keeps react-query's default "always online" and every
      // offline mutation errors instead of queueing.
      try {
        // Wire NetInfo + NAS-reachability into onlineManager before the tree mounts,
        // so the first render already reflects real connectivity.
        startConnectivityManager();
      } catch (err) {
        console.error("[App] connectivity manager failed to start", err);
      }
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

  // Check for a newer APK on cold start and whenever the app returns to the
  // foreground, so a build published while backgrounded still gets picked up.
  const checkForUpdate = useUpdateStore((s) => s.checkForUpdate);
  const appState = useRef<AppStateStatus>(AppState.currentState);
  useEffect(() => {
    checkForUpdate();
    const sub = AppState.addEventListener("change", (next) => {
      if (appState.current.match(/inactive|background/) && next === "active") {
        checkForUpdate();
      }
      appState.current = next;
    });
    return () => sub.remove();
  }, [checkForUpdate]);

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
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <StatusBar style="light" />
          {/* Inside SafeAreaProvider so the fallback can use insets, but above
              AuthProvider/navigator so a throw in either is caught rather than
              silently unmounting the tree to an empty window. */}
          <ErrorBoundary>
            <UpdateBanner />
            <AuthProvider>
              <RootNavigator />
            </AuthProvider>
          </ErrorBoundary>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </PersistQueryClientProvider>
  );
}
