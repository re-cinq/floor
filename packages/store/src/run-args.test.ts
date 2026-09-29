import { describe, expect, it } from "vitest";
import { valueArgsOf } from "./run-args.js";

describe("valueArgsOf", () => {
  it("keeps a run's values and leaves out its files and its repository", () => {
    const startItems = {
      repo: { kind: "git", ref: "github.com/o/n@main", by: "start" },
      pr_url: { kind: "value", ref: "https://github.com/o/n/pull/1", by: "start" },
      task_id: { kind: "value", ref: "42", by: "start" },
      plan: { kind: "file", ref: "sha256-plan", by: "start" },
    } as const;

    expect(valueArgsOf(startItems)).toEqual({ pr_url: "https://github.com/o/n/pull/1", task_id: "42" });
  });
});
