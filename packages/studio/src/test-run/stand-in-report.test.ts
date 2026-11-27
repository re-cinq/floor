import { Refusal } from "@re-cinq/floor-assembly-lines";
import { describe, expect, it } from "vitest";
import { standInReport } from "./stand-in-report.js";
import { reviewLoopLine } from "./test-run.fixtures.js";

describe("standInReport", () => {
  it("refuses review reporting rejected, which reviewer does not have among approved and changes_requested", () => {
    expect(() => standInReport(reviewLoopLine, "review", { outcome: "rejected", produced: {} })).toThrow(
      new Refusal("review cannot report rejected: its station reviewer has the outcomes approved, changes_requested"),
    );
  });

  it.each<Record<string, string>>([{}, { review_feedback: "" }, { review_feedback: "   " }])(
    "refuses review requesting changes when the reason is given as %j",
    (produced) => {
      expect(() => standInReport(reviewLoopLine, "review", { outcome: "changes_requested", produced })).toThrow(
        new Refusal("review_feedback is required when review reports changes_requested"),
      );
    },
  );

  it("reports changes_requested with review_feedback 'Tighten the intro: it buries the finding.' and drops secret, which reviewer does not declare", () => {
    expect(
      standInReport(reviewLoopLine, "review", {
        outcome: "changes_requested",
        produced: { review_feedback: "Tighten the intro: it buries the finding.", secret: "injected" },
      }),
    ).toEqual({
      outcome: "changes_requested",
      produced: { review_feedback: "Tighten the intro: it buries the finding." },
    });
  });
});
