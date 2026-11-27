import { describe, expect, it } from "vitest";
import { briefOf } from "./brief.js";
import { failedWriteVisit, reviewVisit, runOf, writeVisit } from "./test-run.fixtures.js";
import type { TestVisit } from "./test-visit.js";

describe("briefOf", () => {
  it("names draft as missing when review opens before any visit produced it", () => {
    const run = runOf([]);

    expect(briefOf(run, "review")).toEqual({ needs: {}, missing: ["draft"] });
  });

  it("gives review the draft at /runs/r1/visits/001-write-1/outputs/draft.md that visit 001-write-1 produced", () => {
    const draftPath = "/runs/r1/visits/001-write-1/outputs/draft.md";
    const run = runOf([writeVisit(1, 1)]);

    expect(briefOf(run, "review")).toEqual({ needs: { draft: draftPath }, missing: [] });
  });

  it("gives write the reason 'Tighten the intro: it buries the finding, and cut the 2nd paragraph.' as feedback after 002-review-1 requested changes", () => {
    const reason = "Tighten the intro: it buries the finding, and cut the 2nd paragraph.";
    const run = runOf([writeVisit(1, 1), reviewVisit(2, 1, "changes_requested", reason)]);

    expect(briefOf(run, "write")).toEqual({ needs: { topic: "tides", feedback: reason }, missing: [] });
  });

  it("gives write no feedback when 004-review-2 requested changes without a reason, although 002-review-1 said 'Tighten the intro.'", () => {
    const run = runOf([
      writeVisit(1, 1),
      reviewVisit(2, 1, "changes_requested", "Tighten the intro."),
      writeVisit(3, 2),
      reviewVisit(4, 2, "changes_requested"),
    ]);

    expect(briefOf(run, "write")).toEqual({ needs: { topic: "tides" }, missing: [] });
  });

  it("gives write its newest failure as previous_error and both failures, newest first, as previous_failures", () => {
    const spawnError = "could not start claude: spawn claude ENOENT";
    const noResultError = "the agent ended without a LORE_NODE_RESULT or REVIEW_RESULT line, and its station requires one";
    const run = runOf([failedWriteVisit(1, 1, spawnError), failedWriteVisit(2, 2, noResultError)]);

    expect(briefOf(run, "write")).toEqual({
      needs: {
        topic: "tides",
        previous_error: noResultError,
        previous_failures: `${noResultError}\n---\n${spawnError}`,
      },
      missing: [],
    });
  });

  it.each([
    {
      nodeId: "review",
      because: "a human station gets no failure context",
      brief: { needs: { draft: "/runs/r1/visits/001-write-1/outputs/draft.md" }, missing: [] },
    },
    {
      nodeId: "write",
      because: "another node's failure is not its own",
      brief: { needs: { topic: "tides" }, missing: [] },
    },
  ])("gives $nodeId no failure context when 002-review-1 failed with 'the reviewer was unreachable': $because", ({ nodeId, brief }) => {
    const failedReview: TestVisit = {
      id: "002-review-1",
      nodeId: "review",
      iteration: 1,
      station: "reviewer",
      report: { outcome: "failed", error: "the reviewer was unreachable" },
    };
    const run = runOf([writeVisit(1, 1), failedReview]);

    expect(briefOf(run, nodeId)).toEqual(brief);
  });
});
