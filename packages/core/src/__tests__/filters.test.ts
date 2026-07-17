import { describe, expect, it } from "vitest";
import type { Place } from "@travel/types";
import { BUILTIN_FILTERS, filterToSql, matchesFilter } from "../filters";

function place(partial: Partial<Pick<Place, "category" | "status">>): Pick<Place, "category" | "status"> {
  return { category: "sight", status: "idea", ...partial };
}

describe("matchesFilter against each built-in list", () => {
  it("places-to-see: sight, not visited", () => {
    const { filter } = BUILTIN_FILTERS["places-to-see"];
    expect(matchesFilter(place({ category: "sight", status: "idea" }), filter)).toBe(true);
    expect(matchesFilter(place({ category: "sight", status: "planned" }), filter)).toBe(true);
    expect(matchesFilter(place({ category: "sight", status: "visited" }), filter)).toBe(false);
    expect(matchesFilter(place({ category: "food", status: "idea" }), filter)).toBe(false);
  });

  it("foods-to-eat: food, not visited", () => {
    const { filter } = BUILTIN_FILTERS["foods-to-eat"];
    expect(matchesFilter(place({ category: "food", status: "idea" }), filter)).toBe(true);
    expect(matchesFilter(place({ category: "food", status: "visited" }), filter)).toBe(false);
  });
});

describe("filterToSql", () => {
  it("produces a parameterized fragment matching matchesFilter semantics", () => {
    const { clause, params } = filterToSql({ category: "food", statusNotIn: ["visited"] });
    expect(clause).toBe("category = ? AND status NOT IN (?)");
    expect(params).toEqual(["food", "visited"]);
  });

  it("falls back to an always-true fragment for an empty filter", () => {
    expect(filterToSql({})).toEqual({ clause: "1=1", params: [] });
  });
});
