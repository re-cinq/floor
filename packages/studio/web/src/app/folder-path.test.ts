import { describe, expect, it } from "vitest";
import { subfolderPath } from "./folder-path";

describe("subfolderPath", () => {
  it.each([
    { parent: "/", folder: "home", path: "/home" },
    { parent: "/home/dev", folder: "runs", path: "/home/dev/runs" },
  ])("gives $path for folder $folder in $parent", ({ parent, folder, path }) => {
    expect(subfolderPath(parent, folder)).toBe(path);
  });
});
