import { describe, expect, it } from "vitest";
import { canonicalItems, canonicalRepo, forRepo, gitRefOf } from "./repo-name.js";

describe("canonicalRepo", () => {
  it("spells github.com/re-cinq/Otto as github.com/re-cinq/otto", () => {
    expect(canonicalRepo("github.com/re-cinq/Otto")).toBe("github.com/re-cinq/otto");
  });
});

describe("gitRefOf", () => {
  it("lowers the repository and keeps the branch Feat/Sweeper as written", () => {
    expect(gitRefOf("github.com/re-cinq/Otto@Feat/Sweeper")).toEqual({ repo: "github.com/re-cinq/otto", branch: "Feat/Sweeper" });
  });

  it("cuts at the first @, so the branch release@2 is kept whole", () => {
    expect(gitRefOf("github.com/re-cinq/otto@release@2")).toEqual({ repo: "github.com/re-cinq/otto", branch: "release@2" });
  });

  it("names no branch for a ref that is a repository alone", () => {
    expect(gitRefOf("github.com/re-cinq/Otto")).toEqual({ repo: "github.com/re-cinq/otto" });
  });
});

describe("canonicalItems", () => {
  it("lowers the repository of a git item", () => {
    const lowered = canonicalItems({ repo: { kind: "git", ref: "github.com/re-cinq/Otto@Main", by: "start", sha: "9E1F" } });

    expect(lowered.repo).toEqual({ kind: "git", ref: "github.com/re-cinq/otto@Main", by: "start", sha: "9E1F" });
  });

  it("leaves a value as it was written, a pull request's address included", () => {
    const lowered = canonicalItems({ pr_url: { kind: "value", ref: "https://github.com/re-cinq/Otto/pull/12", by: "start" } });

    expect(lowered.pr_url.ref).toBe("https://github.com/re-cinq/Otto/pull/12");
  });
});

describe("forRepo", () => {
  it("finds what a definition says of re-cinq/Otto for a run on re-cinq/otto", () => {
    expect(forRepo({ "github.com/re-cinq/Otto": "opus" }, "github.com/re-cinq/otto")).toBe("opus");
  });

  it("finds nothing for a repository the definition does not name", () => {
    expect(forRepo({ "github.com/re-cinq/Otto": "opus" }, "github.com/re-cinq/floor")).toBeUndefined();
  });

  it("finds nothing in a definition that names no repository", () => {
    expect(forRepo(undefined, "github.com/re-cinq/otto")).toBeUndefined();
  });
});
