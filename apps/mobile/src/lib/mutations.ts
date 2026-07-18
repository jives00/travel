import AsyncStorage from "@react-native-async-storage/async-storage";
import { queryClient } from "./queryClient";

/**
 * The offline write contract.
 *
 * Every mobile mutation goes through `useMutation({ mutationKey: [...] })` whose
 * behavior is registered here with `setMutationDefaults`. That registration is
 * what lets a mutation queued while offline **replay after the app is killed and
 * reopened** — the persisted mutation carries only its key + variables, so the
 * function to run it must be re-attached by key at startup (this module is
 * imported for its side effects before the first resume).
 *
 * Temp-ID remapping (the hard part of a whole-trip offline session): an offline
 * `create` can't know its real server id, so it returns an optimistic negative
 * temp id. Later offline edits reference that temp id. On reconnect the queue
 * replays in FIFO order; when the create finally runs, we record temp -> real,
 * and every subsequent mutation resolves its temp references through that map
 * before hitting the server. Without this, "add a place then schedule it" — the
 * normal travel flow — would fail on sync.
 */

// ---- temp ids ---------------------------------------------------------------

const TEMP_ID_COUNTER_KEY = "travel_temp_id_counter";
let tempCounter = -1;

/** Load the persisted temp-id counter so ids stay unique across app restarts
 * (a create made yesterday and one made today must not collide). */
export async function loadTempIdCounter(): Promise<void> {
  const stored = await AsyncStorage.getItem(TEMP_ID_COUNTER_KEY);
  if (stored) tempCounter = Number(stored);
}

/** Allocate a new optimistic id. Always negative, so it's trivially
 * distinguishable from a real server id and sorts/keys without clashing. */
export function nextTempId(): number {
  const id = tempCounter;
  tempCounter -= 1;
  void AsyncStorage.setItem(TEMP_ID_COUNTER_KEY, String(tempCounter));
  return id;
}

export function isTempId(id: number): boolean {
  return id < 0;
}

// ---- temp -> real id map ----------------------------------------------------

const ID_MAP_KEY = "travel_temp_id_map";
let idMap: Record<number, number> = {};

/** Restore the temp->real map before draining the queue on reconnect. */
export async function loadIdMap(): Promise<void> {
  const stored = await AsyncStorage.getItem(ID_MAP_KEY);
  idMap = stored ? (JSON.parse(stored) as Record<number, number>) : {};
}

function recordMapping(tempId: number, realId: number): void {
  idMap[tempId] = realId;
  void AsyncStorage.setItem(ID_MAP_KEY, JSON.stringify(idMap));
}

/** Resolve an id that might be a temp id to its real server id, if known.
 * Real ids and not-yet-synced temp ids pass through unchanged. */
export function resolveId(id: number): number {
  return idMap[id] ?? id;
}

// ---- registration -----------------------------------------------------------

export interface OfflineMutationConfig<TVars, TResult> {
  /** Stable key. Components call `useMutation({ mutationKey })` with the same value. */
  mutationKey: readonly unknown[];
  /** The network call. Variables have already had their temp refs resolved. */
  mutationFn: (vars: TVars) => Promise<TResult>;
  /** Rewrite any temp-id references in the variables to real ids before running.
   * Supply for any mutation that can reference an offline-created entity. */
  resolveRefs?: (vars: TVars) => TVars;
  /** For creates: the temp id this create fulfills, and the real id from the
   * server response — recorded so later queued mutations can be remapped. */
  tempIdOf?: (vars: TVars) => number | undefined;
  realIdOf?: (result: TResult) => number;
}

/** Wire a mutation's default behavior + temp-id handling into the QueryClient. */
export function registerOfflineMutation<TVars, TResult>(config: OfflineMutationConfig<TVars, TResult>): void {
  queryClient.setMutationDefaults(config.mutationKey as unknown[], {
    mutationFn: async (raw: TVars) => {
      const vars = config.resolveRefs ? config.resolveRefs(raw) : raw;
      const result = await config.mutationFn(vars);
      const tempId = config.tempIdOf?.(vars);
      if (tempId != null && isTempId(tempId) && config.realIdOf) {
        recordMapping(tempId, config.realIdOf(result));
      }
      return result;
    },
  });
}

/** Call on reconnect (and once after cache restore). Loads the id map, then
 * drains the paused-mutation queue in order. */
export async function resumeQueuedMutations(): Promise<void> {
  await loadIdMap();
  await queryClient.resumePausedMutations();
}

/** How many edits are waiting to sync — for the "N pending changes" indicator. */
export function pendingMutationCount(): number {
  return queryClient.getMutationCache().getAll().filter((m) => m.state.isPaused).length;
}
