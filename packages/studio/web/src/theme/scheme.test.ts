import { describe, it, expect } from "vitest";
import { parseSchemePref, resolveColorScheme } from "./scheme";

describe("parseSchemePref", () => {
  it.each(["light", "dark", "auto"] as const)("keeps the remembered %s", (pref) => {
    expect(parseSchemePref(pref)).toBe(pref);
  });

  it.each([null, "", "sepia", "DARK"])("falls back to auto for %j", (raw) => {
    expect(parseSchemePref(raw)).toBe("auto");
  });
});

describe("resolveColorScheme", () => {
  it("follows the operating system when the choice is auto", () => {
    expect([resolveColorScheme("auto", true), resolveColorScheme("auto", false)]).toEqual(["dark", "light"]);
  });

  it("ignores the operating system when the choice is light or dark", () => {
    expect([resolveColorScheme("light", true), resolveColorScheme("dark", false)]).toEqual(["light", "dark"]);
  });
});
