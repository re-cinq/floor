import { describe, expect, it } from "vitest";
import { completedFilter, enterAction, entriesMatching, splitTyped } from "./path-completion";

describe("splitTyped", () => {
  it.each([
    { typed: "/home/bogdan/", expected: { folder: "/home/bogdan", filter: "" } },
    { typed: "/home/bogdan/no", expected: { folder: "/home/bogdan", filter: "no" } },
    { typed: "/", expected: { folder: "/", filter: "" } },
    { typed: "/ho", expected: { folder: "/", filter: "ho" } },
    { typed: "", expected: { folder: "", filter: "" } },
    { typed: "notes", expected: { folder: "", filter: "notes" } },
  ])("returns $expected for '$typed'", ({ typed, expected }) => {
    expect(splitTyped(typed)).toEqual(expected);
  });
});

describe("entriesMatching", () => {
  const names = ["alpha", "Beta", "notes.md", "bravo"];

  it.each([
    { filter: "b", expected: ["Beta", "bravo"] },
    { filter: "TA", expected: ["Beta"] },
  ])("returns $expected for filter $filter among alpha, Beta, notes.md, bravo", ({ filter, expected }) => {
    expect(entriesMatching(names, filter)).toEqual(expected);
  });

  const mixedNames = [".cache", "alpha", ".config", "cargo"];

  it.each([
    { filter: "", expected: ["alpha", "cargo"] },
    { filter: ".c", expected: [".cache", ".config"] },
    { filter: "o", expected: ["cargo"] },
  ])("returns $expected for filter '$filter' among .cache, alpha, .config, cargo", ({ filter, expected }) => {
    expect(entriesMatching(mixedNames, filter)).toEqual(expected);
  });
});

describe("completedFilter", () => {
  it.each([
    { matches: [], filter: "zz", expected: "zz" },
    { matches: ["notes.md"], filter: "no", expected: "notes.md" },
    { matches: ["notes.md", "notebook"], filter: "n", expected: "note" },
    { matches: ["Notes.md", "notebook"], filter: "n", expected: "Note" },
    { matches: ["alpha-one", "beta-one"], filter: "one", expected: "one" },
  ])("returns '$expected' for filter '$filter' with matches $matches", ({ matches, filter, expected }) => {
    expect(completedFilter(matches, filter)).toEqual(expected);
  });
});

describe("enterAction refusals", () => {
  const shown = { folders: ["alpha"], files: ["notes.md"] };

  it.each([
    { mode: "file", filter: "note", why: "a prefix of a file" },
    { mode: "file", filter: "missing.md", why: "an unknown name" },
    { mode: "folder", filter: "notes.md", why: "a file name in folder mode" },
    { mode: "folder", filter: "alp", why: "a partial folder name" },
    { mode: "file", filter: "", why: "an empty filter in file mode" },
    { mode: "file", filter: "NOTES.md", why: "a file name in different case" },
  ] as const)("returns none for $mode mode with '$filter', $why", ({ mode, filter }) => {
    expect(enterAction(mode, filter, shown)).toEqual({ kind: "none" });
  });
});
