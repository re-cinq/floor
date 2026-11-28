import { describe, expect, it } from "vitest";
import { childPath } from "./folder-path";

describe("childPath", () => {
  it.each([
    { parent: "/", folder: "home", path: "/home" },
    { parent: "/home/dev", folder: "runs", path: "/home/dev/runs" },
  ])("gives $path for child $folder in $parent", ({ parent, folder, path }) => {
    expect(childPath(parent, folder)).toBe(path);
  });
});
