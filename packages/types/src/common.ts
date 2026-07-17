import { z } from "zod";

export const IdParam = z.object({
  id: z.coerce.number().int().positive(),
});
export type IdParam = z.infer<typeof IdParam>;

export const Pagination = z.object({
  limit: z.coerce.number().int().positive().max(200).default(50),
  offset: z.coerce.number().int().nonnegative().default(0),
});
export type Pagination = z.infer<typeof Pagination>;

/** Delta-sync envelope: clients pass `since` (ISO timestamp of last sync),
 * server returns rows changed after it plus a fresh `syncedAt` to store for next time. */
export const ChangedSinceQuery = z.object({
  since: z.string().datetime().optional(),
});
export type ChangedSinceQuery = z.infer<typeof ChangedSinceQuery>;

export interface DeltaEnvelope<T> {
  items: T[];
  syncedAt: string;
}

export const CurrencyCode = z.string().length(3).toUpperCase();
