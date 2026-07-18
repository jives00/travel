import { useEffect, useState } from "react";
import { View, Text } from "react-native";
import { onlineManager } from "@tanstack/react-query";
import { queryClient } from "../lib/queryClient";
import { pendingMutationCount } from "../lib/mutations";

/** Thin status bar shown only when offline or when edits are queued — so the
 * whole-trip-offline case is legible ("you're offline, N changes will sync"). */
export function SyncBanner() {
  const [online, setOnline] = useState(onlineManager.isOnline());
  const [pending, setPending] = useState(pendingMutationCount());

  useEffect(() => {
    const unsubOnline = onlineManager.subscribe(setOnline);
    const unsubMut = queryClient.getMutationCache().subscribe(() => setPending(pendingMutationCount()));
    return () => {
      unsubOnline();
      unsubMut();
    };
  }, []);

  if (online && pending === 0) return null;

  const label = !online
    ? pending > 0
      ? `Offline · ${pending} change${pending === 1 ? "" : "s"} will sync when reconnected`
      : "Offline · showing saved data"
    : `Syncing ${pending} change${pending === 1 ? "" : "s"}…`;

  return (
    <View className={online ? "bg-category-transit px-3 py-1" : "bg-status-warning px-3 py-1"}>
      <Text className="text-center text-xs font-medium text-white">{label}</Text>
    </View>
  );
}
