import { ScrollView, View, type ViewProps } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { SyncBanner } from "../SyncBanner";

/** Standard screen frame: safe-area inset + page background + the offline/sync
 * banner (edge-to-edge, below the inset). Pass `scroll` for a scrolling body
 * (most list/detail screens); omit for fixed layouts that manage their own FlatList. */
export function Screen({
  children,
  scroll = false,
  padded = true,
  className,
  ...rest
}: ViewProps & { scroll?: boolean; padded?: boolean }) {
  const pad = padded ? "p-4" : "";
  if (scroll) {
    return (
      <SafeAreaView edges={["top"]} className="flex-1 bg-page dark:bg-page-dark">
        <SyncBanner />
        <ScrollView keyboardShouldPersistTaps="handled">
          <View className={`${pad} ${className ?? ""}`}>{children}</View>
        </ScrollView>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView edges={["top"]} className="flex-1 bg-page dark:bg-page-dark">
      <SyncBanner />
      <View className={`flex-1 ${pad} ${className ?? ""}`} {...rest}>
        {children}
      </View>
    </SafeAreaView>
  );
}
