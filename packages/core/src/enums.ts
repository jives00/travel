export interface EnumEntry {
  key: string;
  label: string;
  iconName: string;
  colorKey?: string;
}

/** Fixed, closed set — never user-extensible. Order matters: it's the categorical
 * hue assignment order from packages/ui-tokens, never cycled. */
export const CATEGORIES: EnumEntry[] = [
  { key: "transit", label: "Transit", iconName: "directions_transit", colorKey: "transit" },
  { key: "activity", label: "Activity", iconName: "hiking", colorKey: "activity" },
  { key: "shopping", label: "Shopping", iconName: "shopping_bag", colorKey: "shopping" },
  { key: "sight", label: "Sight", iconName: "photo_camera", colorKey: "sight" },
  { key: "lodging", label: "Lodging", iconName: "bed", colorKey: "lodging" },
  { key: "food", label: "Food", iconName: "restaurant", colorKey: "food" },
  { key: "other", label: "Other", iconName: "place", colorKey: "other" },
];

/** Pin encoding: status sets the shape/ring, never color (color is category's job). */
export const STATUSES: (EnumEntry & { shape: "hollow" | "filled" | "filled-check" })[] = [
  { key: "idea", label: "Idea", iconName: "lightbulb", shape: "hollow" },
  { key: "planned", label: "Planned", iconName: "event", shape: "filled" },
  { key: "visited", label: "Visited", iconName: "check_circle", shape: "filled-check" },
];

/** Budget categories — a separate fixed list from place CATEGORIES (budget needs
 * "flights", places don't need a budget-only category). No forced 1:1 unification. */
export const EXPENSE_CATEGORIES: EnumEntry[] = [
  { key: "flights", label: "Flights", iconName: "flight" },
  { key: "lodging", label: "Lodging", iconName: "bed" },
  { key: "food", label: "Food", iconName: "restaurant" },
  { key: "activities", label: "Activities", iconName: "hiking" },
  { key: "transit", label: "Transit", iconName: "directions_transit" },
  { key: "shopping", label: "Shopping", iconName: "shopping_bag" },
  { key: "other", label: "Other", iconName: "receipt_long" },
];

export const BOOKING_TYPES: EnumEntry[] = [
  { key: "flight", label: "Flight", iconName: "flight" },
  { key: "hotel", label: "Hotel", iconName: "bed" },
  { key: "train", label: "Train", iconName: "train" },
  { key: "car", label: "Rental car", iconName: "directions_car" },
  { key: "restaurant", label: "Restaurant", iconName: "restaurant" },
  { key: "event", label: "Event", iconName: "confirmation_number" },
  { key: "activity", label: "Tour / Activity", iconName: "hiking" },
];

export function enumLabel(entries: EnumEntry[], key: string): string {
  return entries.find((e) => e.key === key)?.label ?? key;
}
