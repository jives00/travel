import { z } from "zod";

export const Settings = z.object({
  userId: z.number().int(),
  homeCurrency: z.string().length(3).nullable(),
  distanceUnit: z.enum(["km", "mi"]),
  defaultTravelMode: z.enum(["walk", "transit", "drive"]),
  defaultBufferM: z.number().int().positive(),
  showPrivateItems: z.boolean(),
  updatedAt: z.string(),
});
export type Settings = z.infer<typeof Settings>;

export const UpdateSettingsBody = z.object({
  homeCurrency: z.string().length(3).optional(),
  distanceUnit: z.enum(["km", "mi"]).optional(),
  defaultTravelMode: z.enum(["walk", "transit", "drive"]).optional(),
  defaultBufferM: z.number().int().positive().optional(),
  showPrivateItems: z.boolean().optional(),
});
export type UpdateSettingsBody = z.infer<typeof UpdateSettingsBody>;
