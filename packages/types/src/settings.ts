import { z } from "zod";

export const Settings = z.object({
  userId: z.number().int(),
  homeCurrency: z.string().length(3).nullable(),
  distanceUnit: z.enum(["km", "mi"]),
  defaultTravelMode: z.enum(["walk", "transit", "drive"]),
  defaultBufferM: z.number().int().positive(),
  showPrivateItems: z.boolean(),
  // Zone for events with no leg to inherit one from. Null falls back to the
  // viewing calendar's own zone.
  homeTimezone: z.string().nullable(),
  updatedAt: z.string(),
});
export type Settings = z.infer<typeof Settings>;

export const UpdateSettingsBody = z.object({
  homeCurrency: z.string().length(3).optional(),
  distanceUnit: z.enum(["km", "mi"]).optional(),
  defaultTravelMode: z.enum(["walk", "transit", "drive"]).optional(),
  defaultBufferM: z.number().int().positive().optional(),
  showPrivateItems: z.boolean().optional(),
  // Nullish, not optional: clearing this back to "use the calendar's zone"
  // has to be expressible. See the PATCH convention in CLAUDE.md.
  homeTimezone: z.string().max(64).nullish(),
});
export type UpdateSettingsBody = z.infer<typeof UpdateSettingsBody>;
