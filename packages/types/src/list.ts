import { z } from "zod";

export const CustomList = z.object({
  id: z.number().int(),
  userId: z.number().int(),
  tripId: z.number().int().nullable(), // null → global list
  name: z.string(),
  slug: z.string(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type CustomList = z.infer<typeof CustomList>;

export const CreateListBody = z.object({
  name: z.string().min(1),
  tripId: z.number().int().optional(),
});
export type CreateListBody = z.infer<typeof CreateListBody>;

export const UpdateListBody = z.object({
  name: z.string().min(1),
});
export type UpdateListBody = z.infer<typeof UpdateListBody>;

export const ReorderListItemsBody = z.object({
  itemIds: z.array(z.number().int()).min(1),
});
export type ReorderListItemsBody = z.infer<typeof ReorderListItemsBody>;

export const ListItem = z.object({
  id: z.number().int(),
  listId: z.number().int(),
  text: z.string(),
  done: z.boolean(),
  sortOrder: z.number().int(),
  createdAt: z.string(),
});
export type ListItem = z.infer<typeof ListItem>;

export const AddListItemBody = z.object({
  text: z.string().min(1),
});
export type AddListItemBody = z.infer<typeof AddListItemBody>;

export const UpdateListItemBody = z.object({
  done: z.boolean(),
});
export type UpdateListItemBody = z.infer<typeof UpdateListItemBody>;

export interface ListWithItems extends CustomList {
  items: ListItem[];
}
