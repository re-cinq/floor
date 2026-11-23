import { describe, expect, it } from "vitest";
import { placeholderPattern } from "./placeholder-pattern.js";

describe("placeholderPattern", () => {
  it.each([
    ["{review.notes}", "review.notes"],
    ["{a-b}", "a-b"],
    ["{_x9}", "_x9"],
  ])("captures the name in %s as %s", (text, name) => {
    expect(placeholderPattern().exec(text)?.[1]).toBe(name);
  });

  it.each(["{9x}", "{}", '{"key": 1}'])("matches nothing in %s", (text) => {
    expect(placeholderPattern().test(text)).toBe(false);
  });

  it("returns a fresh global pattern each call, so lastIndex is never shared", () => {
    const first = placeholderPattern("g");
    first.exec("{a}");

    expect(placeholderPattern("g").lastIndex).toBe(0);
  });
});
