import { queryOptions } from "@tanstack/react-query";
import type { createWishlistEndpoints } from "../endpoints/wishlist";

export function createWishlistQueries(wishlist: ReturnType<typeof createWishlistEndpoints>) {
  return {
    wishlistQuery: () =>
      queryOptions({
        queryKey: ["wishlist"] as const,
        queryFn: () => wishlist.list(),
      }),
  };
}
