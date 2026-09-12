import { useEffect, useState } from "react";
import { ActivityIndicator, Text, View } from "react-native";
import { PRIMARY_ACCENT } from "@travel/ui-tokens";
import { Button } from "./ui";

/** How long to wait before admitting something is wrong. Bootstrap normally
 * finishes in well under a second on Tailscale; the probe timeout alone is 2.5s,
 * so 8s means "this is not just a slow hop". */
const STUCK_AFTER_MS = 8000;

/**
 * Shown while auth bootstrap is in flight. Replaces the bare `return null` the
 * navigator used to render, which made every failure to settle indistinguishable
 * from a crash: a black screen with no error and no way out but a force-close.
 *
 * A spinner that becomes a retry is the whole point — even if some future hang
 * gets past the resolver's timeouts, the user can recover without killing the app.
 */
export function BootScreen({ onRetry }: { onRetry: () => void }) {
  const [stuck, setStuck] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setStuck(true), STUCK_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View className="flex-1 items-center justify-center bg-page px-8 dark:bg-page-dark">
      <ActivityIndicator size="large" color={PRIMARY_ACCENT.light} />
      {stuck && (
        <View className="mt-6 w-full items-center">
          <Text className="text-center text-base font-medium text-text-primary dark:text-text-primary-dark">
            Still connecting
          </Text>
          <Text className="mt-2 text-center text-sm text-text-secondary dark:text-text-secondary-dark">
            Can't reach the server. Check that Tailscale is on, then try again.
          </Text>
          <Button title="Try again" className="mt-5 w-40" onPress={onRetry} />
        </View>
      )}
    </View>
  );
}
