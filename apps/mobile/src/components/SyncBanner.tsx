import { useSyncExternalStore } from "react";
import { View, Text } from "react-native";
import { onlineManager } from "@tanstack/react-query";
import { queryClient } from "../lib/queryClient";
import { pendingMutationCount } from "../lib/mutations";

// Module scope so their identity is stable — a new subscribe function on every
// render would make React tear down and re-establish the subscription each time.
const subscribeOnline = (onChange: () => void) => onlineManager.subscribe(() => onChange());
const subscribePending = (onChange: () => void) => queryClient.getMutationCache().subscribe(() => onChange());
const getOnline = () => onlineManager.isOnline();

/** Thin status bar shown only when offline or when edits are queued — so the
 * whole-trip-offline case is legible ("you're offline, N changes will sync"). */
export function SyncBanner() {
  // useSyncExternalStore, not useState + a subscribe effect: the mutation cache
  // notifies synchronously *during another component's render*. Every
  // useMutation builds its observer in a useState initializer, whose constructor
  // fires an "observerOptionsUpdated" notification — so a screen mounting many
  // mutation hooks (ListCard has 11) would call setState on this component
  // mid-render and trip React's "cannot update a component while rendering a
  // different component" warning. useSyncExternalStore is built to absorb that.
  const online = useSyncExternalStore(subscribeOnline, getOnline);
  const pending = useSyncExternalStore(subscribePending, pendingMutationCount);

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
