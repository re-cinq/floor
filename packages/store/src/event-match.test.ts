import { describe, expect, it } from "vitest";
import { answersOf, matchesWhen, repoFrom, startItemsFrom, startsOn } from "./event-match.js";
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

describe("matchesWhen", () => {
  it("matches when there is nothing to compare", () => {
    expect(matchesWhen(undefined, {})).toBe(true);
  });

  it("compares a boolean in the line with a boolean in the payload", () => {
    expect(matchesWhen({ merged: true }, { merged: true })).toBe(true);
  });

  it("does not match a field the payload lacks", () => {
    expect(matchesWhen({ merged: false }, {})).toBe(false);
  });

  it("does not match a different value", () => {
    expect(matchesWhen({ outcome: "failed" }, { outcome: "success" })).toBe(false);
  });
});

describe("startsOn", () => {
  it("is true for a declared event whose payload satisfies when", () => {
    expect(startsOn(REVIEW_LINE, "github.pull_request.opened", OPENED)).toBe(true);
  });

  it("is false for a draft, which when excludes", () => {
    expect(startsOn(REVIEW_LINE, "github.pull_request.opened", { ...OPENED, draft: true })).toBe(false);
  });

  it("is false for an event the line does not declare", () => {
    expect(startsOn(REVIEW_LINE, "github.pull_request.closed", OPENED)).toBe(false);
  });
});

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

  it("answers no repo for an event with no git argument and no repo in its payload", () => {
    expect(repoFrom({}, {})).toBeNull();
  });
});

describe("answersOf", () => {
  it("answers success for a merged pull request", () => {
    expect(answersOf(REVIEW_LINE, "github.pull_request.closed", { merged: true })).toEqual([{ nodeId: "merged", outcome: "success" }]);
  });

  it("answers failed for one closed unmerged", () => {
    expect(answersOf(REVIEW_LINE, "github.pull_request.closed", { merged: false })).toEqual([{ nodeId: "merged", outcome: "failed" }]);
  });

  it("answers nothing for an event no node waits on", () => {
    expect(answersOf(REVIEW_LINE, "github.pull_request.opened", OPENED)).toEqual([]);
  });
});
