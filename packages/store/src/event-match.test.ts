import { describe, expect, it } from "vitest";
import { repoFrom, startItemsFrom } from "./event-match.js";
import type { LineBody } from "./types.js";

const REVIEW_LINE: LineBody = {
  entry: "review",
  exit: "done",
  start: {
    on: ["github.pull_request.opened", "github.pull_request.synchronize"],
    when: { draft: false },
    args: { repo: "{repository}@{head_ref}", pr_url: "{pull_request_url}" },
  },
  args: { repo: { kind: "git" }, pr_url: { kind: "value", subject: true } },
  nodes: [
    { id: "review", station: "review" },
    {
      id: "merged",
      station: "pr-merged",
      reports: [
        { on: "github.pull_request.closed", when: { merged: true }, outcome: "success" },
        { on: "github.pull_request.closed", when: { merged: false }, outcome: "failed" },
      ],
    },
    { id: "done" },
  ],
  edges: [],
};

const OPENED = { repository: "github.com/re-cinq/lore", head_ref: "feat", pull_request_url: "https://pr/412", draft: false };

describe("startItemsFrom", () => {
  it("renders each argument from the payload, with the kind the line declares", () => {
    expect(startItemsFrom(REVIEW_LINE, "github.pull_request.opened", OPENED)).toEqual({
      repo: { kind: "git", ref: "github.com/re-cinq/lore@feat", by: "github.pull_request.opened" },
      pr_url: { kind: "value", ref: "https://pr/412", by: "github.pull_request.opened" },
    });
  });

  it("refuses a mapping to an argument the line does not declare", () => {
    const line: LineBody = { ...REVIEW_LINE, start: { on: ["e"], args: { stray: "{repository}" } } };

    expect(() => startItemsFrom(line, "e", OPENED)).toThrow(/does not declare/);
  });
});

describe("repoFrom", () => {
  it("takes the repo from the git argument, without its branch", () => {
    expect(repoFrom({ repo: { kind: "git", ref: "github.com/re-cinq/lore@feat", by: "e" } }, {})).toBe("github.com/re-cinq/lore");
  });

  it("falls back to the repo the payload carries", () => {
    expect(repoFrom({}, { repo: "github.com/re-cinq/lore" })).toBe("github.com/re-cinq/lore");
  });

  it("falls back to the repository the payload carries when it has no repo", () => {
    expect(repoFrom({}, { repository: "github.com/re-cinq/lore" })).toBe("github.com/re-cinq/lore");
  });

  it("answers no repo for an event with no git argument and no repo in its payload", () => {
    expect(repoFrom({}, {})).toBeNull();
  });
});
