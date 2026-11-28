import { describe, expect, it } from "vitest";
import { masksOfPath, matchesMask } from "./file-mask";

describe("matchesMask", () => {
  it("matches only photo.png of photo.png, photoXpng and photo.png.bak for *.png", () => {
    const fileNames = ["photo.png", "photoXpng", "photo.png.bak"];

    expect(fileNames.filter((name) => matchesMask(name, ["*.png"]))).toEqual(["photo.png"]);
  });
});

describe("masksOfPath", () => {
  it.each([
    ["Makefile", undefined],
    [undefined, undefined],
    ["notes/annotated.md", [{ label: "*.md", patterns: ["*.md"] }]],
  ])("returns the mask for %s", (path, expected) => {
    expect(masksOfPath(path)).toStrictEqual(expected);
  });
});
