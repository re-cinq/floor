import { describe, expect, it } from "vitest";
import { gitArgNames } from "./line-args.js";
import type { LineArgSpec } from "./types.js";

describe("gitArgNames", () => {
  it("answers the names of the args of kind git, and leaves out the others", () => {
    const args: Record<string, LineArgSpec> = {
      repo: { kind: "git" },
      pr_url: { kind: "value", subject: true },
      plan: { kind: "file" },
      docs: { kind: "git" },
    };

    expect(gitArgNames(args)).toEqual(["repo", "docs"]);
  });
});
