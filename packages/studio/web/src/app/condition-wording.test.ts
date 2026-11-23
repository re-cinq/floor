import { describe, it, expect } from "vitest";
import { conditionWording } from "./condition-wording";

describe("conditionWording", () => {
  it('joins two keys with "and" under a single "if"', () => {
    expect(conditionWording({ repo: "re-cinq/floor", draft: false })).toEqual(
      ", if repo is re-cinq/floor and draft is false",
    );
  });
});
