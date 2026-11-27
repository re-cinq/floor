import type { LineBody, WhenValue } from "@re-cinq/floor-contracts";
import { describe, expect, it } from "vitest";
import { answersOf, matchesWhen, startsOn } from "./event-match.js";
import { approvalLine, pullRequestLine } from "./event-match.fixtures.js";

describe("matchesWhen", () => {
  it("matches payload {anything: 1} when there is nothing to compare", () => {
    expect(matchesWhen(undefined, { anything: 1 })).toBe(true);
  });

  it("matches when {merged: true} meets payload {merged: true}", () => {
    expect(matchesWhen({ merged: true }, { merged: true })).toBe(true);
  });

  it("does not match when {merged: false} meets a payload without merged", () => {
    expect(matchesWhen({ merged: false }, {})).toBe(false);
  });

  it("does not match when {outcome: failed} meets payload {outcome: success}", () => {
    expect(matchesWhen({ outcome: "failed" }, { outcome: "success" })).toBe(false);
  });

  it("does not match when toString is expected and the payload {} only inherits it", () => {
    const inheritedName: Record<string, WhenValue> = { ["toString"]: "function toString() { [native code] }" };

    expect(matchesWhen(inheritedName, {})).toBe(false);
  });
});

describe("startsOn", () => {
  it("starts a run when github.pull_request.opened carries {draft: false} and the line waits for {draft: false}", () => {
    expect(startsOn(pullRequestLine, "github.pull_request.opened", { draft: false })).toBe(true);
  });

  it("starts no run when github.pull_request.closed arrives and the line starts only on github.pull_request.opened", () => {
    expect(startsOn(pullRequestLine, "github.pull_request.closed", { draft: false })).toBe(false);
  });

  it("starts no run when github.pull_request.opened carries {draft: true} and the line waits for {draft: false}", () => {
    expect(startsOn(pullRequestLine, "github.pull_request.opened", { draft: true })).toBe(false);
  });

  it("starts no run when release.requested carries {release: 1.4.0} and the line declares no start", () => {
    expect(startsOn(approvalLine, "release.requested", { release: "1.4.0" })).toBe(false);
  });
});

describe("answersOf", () => {
  it("answers no node when release.answered arrives without the decision that approve waits for", () => {
    expect(answersOf(approvalLine, "release.answered", {})).toEqual([]);
  });

  it("answers success for node merged when github.pull_request.closed carries {merged: true}", () => {
    expect(answersOf(pullRequestLine, "github.pull_request.closed", { merged: true })).toEqual([{ nodeId: "merged", outcome: "success" }]);
  });

  it("answers failed for node merged when github.pull_request.closed carries {merged: false}", () => {
    expect(answersOf(pullRequestLine, "github.pull_request.closed", { merged: false })).toEqual([{ nodeId: "merged", outcome: "failed" }]);
  });

  it("answers no node when github.pull_request.opened arrives and no node waits on it", () => {
    expect(answersOf(pullRequestLine, "github.pull_request.opened", { draft: false })).toEqual([]);
  });

  it("answers approve once with approved when both its reports match release.answered {decision: approved}", () => {
    const line: LineBody = {
      entry: "approve",
      exit: "approve",
      args: {},
      nodes: [
        {
          id: "approve",
          reports: [
            { on: "release.answered", when: { decision: "approved" }, outcome: "approved" },
            { on: "release.answered", outcome: "seen" },
          ],
        },
      ],
      edges: [],
    };

    expect(answersOf(line, "release.answered", { decision: "approved" })).toEqual([{ nodeId: "approve", outcome: "approved" }]);
  });
});
