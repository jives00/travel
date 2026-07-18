import NetInfo from "@react-native-community/netinfo";
import { onlineManager } from "@tanstack/react-query";
import { baseUrl } from "./api";

/**
 * The single source of truth for "can we reach home right now?" — and the bridge
 * that turns it into TanStack Query's `onlineManager` state (which auto-pauses
 * mutations when offline and auto-resumes the queue + refetches when back).
 *
 * Why this is more than NetInfo: the driving use case is the home NAS losing
 * power while the user is *traveling*, where the phone still has cellular/wifi.
 * NetInfo would report "online" the whole trip, so device connectivity alone
 * would keep firing requests at a dead server and never queue anything. "Online"
 * here means **device has a network AND an API base answered `/health`** — so the
 * NAS being unreachable reads as offline even with a perfectly good phone signal.
 *
 * Recovery: while we believe we're offline, poll `/health` on an interval so the
 * moment the NAS is powered back on (user gets home) we flip online, which lets
 * react-query drain the queued edits and reconcile.
 */

// How often to re-probe home while we think we're offline. The NAS-down window
// is a whole trip, so there's no rush — 20s balances "notice recovery promptly
// when I walk in the door" against battery.
const OFFLINE_POLL_MS = 20_000;

let recoveryTimer: ReturnType<typeof setInterval> | null = null;
let checking = false;

type Listener = (online: boolean) => void;
const listeners = new Set<Listener>();

/** Subscribe to reachability changes (for an "offline / syncing" banner). */
export function onConnectivityChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function setOnline(online: boolean): void {
  const was = onlineManager.isOnline();
  onlineManager.setOnline(online);
  if (online) stopRecoveryPoll();
  else startRecoveryPoll();
  if (was !== online) for (const l of listeners) l(online);
}

function startRecoveryPoll(): void {
  if (recoveryTimer) return;
  recoveryTimer = setInterval(() => {
    void evaluate("poll");
  }, OFFLINE_POLL_MS);
}

function stopRecoveryPoll(): void {
  if (recoveryTimer) {
    clearInterval(recoveryTimer);
    recoveryTimer = null;
  }
}

/**
 * Re-derive online state. `device` events (NetInfo) short-circuit to offline
 * without a probe when there's no network at all; otherwise we confirm the NAS
 * is actually reachable before declaring ourselves online.
 */
async function evaluate(source: "device-online" | "device-offline" | "poll" | "init"): Promise<void> {
  if (source === "device-offline") {
    setOnline(false);
    return;
  }
  if (checking) return;
  checking = true;
  try {
    const reachable = await baseUrl.isReachable();
    setOnline(reachable);
  } finally {
    checking = false;
  }
}

let started = false;

/** Call once at app start (after the QueryClient exists). Idempotent. */
export function startConnectivityManager(): void {
  if (started) return;
  started = true;

  // react-query's default onlineManager uses a web `navigator.onLine` listener
  // that never fires in RN. Replace its subscription with NetInfo so nothing
  // races our own setOnline calls.
  onlineManager.setEventListener((setter) => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const hasDeviceNet = state.isConnected !== false && state.isInternetReachable !== false;
      if (!hasDeviceNet) {
        setter(false);
        stopRecoveryPoll();
        startRecoveryPoll();
        for (const l of listeners) l(false);
      } else {
        // Device has a network — but confirm home is reachable before going online.
        void evaluate("device-online");
      }
    });
    return unsubscribe;
  });

  void evaluate("init");
}
