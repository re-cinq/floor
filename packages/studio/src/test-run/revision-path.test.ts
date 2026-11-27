import { describe, expect, it } from "vitest";
import { briefOf } from "./brief.js";
import { nextTransitionOf } from "./next-transition.js";
import { outcomeFieldsOf } from "./outcome-fields.js";
import { standInReport } from "./stand-in-report.js";
import { reviewLoopLine, runOf, writeVisit } from "./test-run.fixtures.js";

describe("the revision path of review-loop", () => {
  it("opens write 2 with feedback 'Tighten the intro: it buries the finding, and cut the 2nd paragraph.' after a stand-in for review requests changes with that reason", () => {
    const reason = "Tighten the intro: it buries the finding, and cut the 2nd paragraph.";
    const fields = outcomeFieldsOf(reviewLoopLine, "review", "changes_requested");
    const produced = Object.fromEntries(fields.map((field) => [field.name, reason]));
    const report = standInReport(reviewLoopLine, "review", { outcome: "changes_requested", produced });
    const reviewVisit = { id: "002-review-1", nodeId: "review", iteration: 1, station: "reviewer", report };
    const run = runOf([writeVisit(1, 1), reviewVisit]);

    expect({ next: nextTransitionOf(run), brief: briefOf(run, "write") }).toEqual({
      next: { kind: "launch", nodeId: "write", iteration: 2 },
      brief: { needs: { topic: "tides", feedback: reason }, missing: [] },
    });
  });
});
