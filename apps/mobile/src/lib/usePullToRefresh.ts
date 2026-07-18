import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";

/** Generic pull-to-refresh: refetches every currently-mounted query rather than
 * requiring each screen to enumerate its own query keys. Wire the returned
 * `refreshing`/`onRefresh` into a ScrollView/FlatList's `refreshControl` (or
 * its `refreshing`/`onRefresh` props directly). */
export function usePullToRefresh() {
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await queryClient.refetchQueries({ type: "active" });
    } finally {
      setRefreshing(false);
    }
  }, [queryClient]);

  return { refreshing, onRefresh };
}
