import { z } from "zod";

/** Where the money for a budget line came from — user-defined, managed in
 * settings, seeded with "Regular cash" / "Off balance" / "CC points"
 * (migration 035). Names are opaque to every consumer: nothing branches on the
 * text, so renaming one is safe and a rollup groups by id, never by label. */
export const FundingSource = z.object({
  id: z.number().int(),
  name: z.string(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FundingSource = z.infer<typeof FundingSource>;

export const CreateFundingSourceBody = z.object({
  name: z.string().min(1).max(80),
  sortOrder: z.number().int().optional(),
});
export type CreateFundingSourceBody = z.infer<typeof CreateFundingSourceBody>;

export const UpdateFundingSourceBody = z.object({
  name: z.string().min(1).max(80).optional(),
  sortOrder: z.number().int().optional(),
});
export type UpdateFundingSourceBody = z.infer<typeof UpdateFundingSourceBody>;
