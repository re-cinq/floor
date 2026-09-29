import { describe, expect, it } from "vitest";
import { startArgProblems } from "./start-args.js";
import type { Item, LineArgSpec } from "./types.js";

const args: Record<string, LineArgSpec> = {
  repo: { kind: "git" },
  pr_url: { kind: "value", subject: true },
};
const repoItem: Item = { kind: "git", ref: "github.com/o/n@main", by: "start" };
const prUrlItem: Item = { kind: "value", ref: "https://github.com/o/n/pull/1", by: "start" };

describe("startArgProblems", () => {
  it("returns nothing when every declared arg is present with its kind", () => {
    expect(startArgProblems(args, { repo: repoItem, pr_url: prUrlItem })).toEqual([]);
  });

  it("names the missing arg when pr_url is absent", () => {
    expect(startArgProblems(args, { repo: repoItem })).toEqual(['startItems.pr_url: required by the line, as kind "value"']);
  });

  it("names the kind mismatch when repo arrives as a value", () => {
    expect(startArgProblems(args, { repo: { ...repoItem, kind: "value" }, pr_url: prUrlItem })).toEqual([
      'startItems.repo: the line wants kind "git", got "value"',
    ]);
  });

  it("names every problem when one arg is missing and another has the wrong kind", () => {
    expect(startArgProblems(args, { repo: { ...repoItem, kind: "file" } })).toEqual([
      'startItems.repo: the line wants kind "git", got "file"',
      'startItems.pr_url: required by the line, as kind "value"',
    ]);
  });

  it("allows a start item the line does not declare", () => {
    expect(startArgProblems(args, { repo: repoItem, pr_url: prUrlItem, spec: { kind: "file", ref: "sha256-x", by: "start" } })).toEqual([]);
  });

  it("returns nothing when the line declares no args", () => {
    expect(startArgProblems({}, {})).toEqual([]);
  });
});
