import type { Place, PlaceFilter } from "@travel/types";

/** The built-in, always-available saved filters ("Places to see", "Foods to eat").
 * These are PlaceFilter objects, not database rows — see travel-feature-spec.md §3 Lists. */
export const BUILTIN_FILTERS: Record<string, { label: string; filter: PlaceFilter }> = {
  "places-to-see": {
    label: "Places to see",
    filter: { category: "sight", statusNotIn: ["visited"] },
  },
  "foods-to-eat": {
    label: "Foods to eat",
    filter: { category: "food", statusNotIn: ["visited"] },
  },
};

/** Evaluated client-side against cached data (offline) and server-side via filterToSql
 * (online) — same semantics both places, one object shape. */
export function matchesFilter(place: Pick<Place, "category" | "status">, filter: PlaceFilter): boolean {
  if (filter.category && place.category !== filter.category) return false;
  if (filter.statusIn && !filter.statusIn.includes(place.status)) return false;
  if (filter.statusNotIn && filter.statusNotIn.includes(place.status)) return false;
  return true;
}

export interface SqlFragment {
  clause: string; // e.g. "category = ? AND status NOT IN (?, ?)"
  params: (string | number)[];
}

/** Turns a PlaceFilter into a parameterized SQL WHERE fragment (no leading "AND"/"WHERE"). */
export function filterToSql(filter: PlaceFilter): SqlFragment {
  const clauses: string[] = [];
  const params: (string | number)[] = [];

  if (filter.category) {
    clauses.push("category = ?");
    params.push(filter.category);
  }
  if (filter.statusIn?.length) {
    clauses.push(`status IN (${filter.statusIn.map(() => "?").join(", ")})`);
    params.push(...filter.statusIn);
  }
  if (filter.statusNotIn?.length) {
    clauses.push(`status NOT IN (${filter.statusNotIn.map(() => "?").join(", ")})`);
    params.push(...filter.statusNotIn);
  }

  return { clause: clauses.length ? clauses.join(" AND ") : "1=1", params };
}
