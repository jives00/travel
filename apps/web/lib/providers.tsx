"use client";

import { useState } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { makeQueryClient } from "./queryClient";
import { AuthProvider } from "./auth-context";
import { ThemeProvider } from "./theme-context";

let browserQueryClient: ReturnType<typeof makeQueryClient> | undefined;

function getQueryClient() {
  // One QueryClient per browser tab (singleton), a fresh one per server request —
  // see lib/queryClient.ts's comment on why these can't be the same instance.
  if (typeof window === "undefined") return makeQueryClient();
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(getQueryClient);
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider>{children}</AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
