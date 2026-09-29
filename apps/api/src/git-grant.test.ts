import { describe, expect, it } from "vitest";
import type { DispatchNeed } from "@floor/store";
import { declaresWrite, gitNeedFor } from "./git-grant.js";

const READ: DispatchNeed = { name: "reference", kind: "git", path: "reference", repoUrl: "https://github.com/re-cinq/lore", ref: "main", access: "read" };
const WRITE: DispatchNeed = { name: "workspace", kind: "git", path: "workspace", repoUrl: "https://github.com/re-cinq/floor.git", ref: "9e1f", access: "write" };
const SPEC: DispatchNeed = { name: "spec", kind: "file", path: "spec.md", url: "http://floor.test/blobs/sha256-abc" };

describe("gitNeedFor", () => {
  it("finds the need for re-cinq/lore by its clone url", () => {
    expect(gitNeedFor([SPEC, READ, WRITE], "re-cinq/lore")).toEqual(READ);
  });

  it("finds re-cinq/floor behind a clone url ending in .git", () => {
    expect(gitNeedFor([READ, WRITE], "re-cinq/floor")).toEqual(WRITE);
  });

  it("finds nothing for re-cinq/secrets, which the visit was never given", () => {
    expect(gitNeedFor([READ, WRITE], "re-cinq/secrets")).toBeUndefined();
  });

  it("finds nothing for lore alone, which is only the end of a name", () => {
    expect(gitNeedFor([READ], "lore")).toBeUndefined();
  });

  it("picks write when the same repository is needed both ways", () => {
    const written: DispatchNeed = { ...READ, name: "workspace", access: "write" };

    expect(gitNeedFor([READ, written], "re-cinq/lore")).toEqual(written);
  });
});

describe("declaresWrite", () => {
  it("is true with a git need declaring write", () => {
    expect(declaresWrite([SPEC, WRITE])).toBe(true);
  });

  it("is false with a git need that only reads", () => {
    expect(declaresWrite([SPEC, READ])).toBe(false);
  });
});
