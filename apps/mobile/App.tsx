import { useEffect, useState } from "react";
import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { createAsyncStoragePersister } from "@tanstack/query-async-storage-persister";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colorScheme } from "nativewind";
import "./global.css";

import { AuthProvider } from "./src/contexts/AuthContext";
import { RootNavigator } from "./src/navigation";

const THEME_KEY = "theme";

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000 } },
});

// persistQueryClient + AsyncStorage *is* the offline story (spec decision): cold
// start renders from cache instantly, refetches happen in the background.
const persister = createAsyncStoragePersister({ storage: AsyncStorage });

export default function App() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Mobile defaults to light (outdoor/direct-sun readability) unless the user
    // has explicitly switched to dark — the opposite default from web. NativeWind's
    // colorScheme otherwise follows the system setting, which we don't want here.
    AsyncStorage.getItem(THEME_KEY).then((stored) => {
      colorScheme.set(stored === "dark" ? "dark" : "light");
      setReady(true);
    });
  }, []);

  if (!ready) return null;

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={{ persister }}>
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </PersistQueryClientProvider>
  );
}
