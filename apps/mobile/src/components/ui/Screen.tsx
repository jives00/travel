import { RefreshControl, ScrollView, View, type ViewProps } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePullToRefresh } from "../../lib/usePullToRefresh";
import { SyncBanner } from "../SyncBanner";

// Matches web's top-nav chrome (#323440) — Android's edge-to-edge status bar
// is always transparent, so this is what actually paints the pixels behind it.
export const STATUS_BAR_BG = "#323440";

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
  const insets = useSafeAreaInsets();
  const { refreshing, onRefresh } = usePullToRefresh();
  const pad = padded ? "p-4" : "";
  const body = scroll ? (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ flexGrow: 1 }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <View className={`flex-1 ${pad} ${className ?? ""}`}>{children}</View>
    </ScrollView>
  ) : (
    <View className={`flex-1 ${pad} ${className ?? ""}`} {...rest}>
      {children}
    </View>
  );

  return (
    <View className="flex-1 bg-page dark:bg-page-dark">
      <View style={{ height: insets.top, backgroundColor: STATUS_BAR_BG }} />
      <SyncBanner />
      {body}
    </View>
  );
}
