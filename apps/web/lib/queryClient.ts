import { QueryClient } from "@tanstack/react-query";

/** A fresh QueryClient per server request (never shared/reused across requests —
 * that would leak one user's data into another's response in a multi-request server). */
export function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
      },
    },
  });
}
