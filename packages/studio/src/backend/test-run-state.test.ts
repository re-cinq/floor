import { describe, expect, it } from "vitest";
import { standInActionsOf } from "../test-run/stand-in-actions.js";
import { reviewLoopLine } from "../test-run/test-run.fixtures.js";
import {
  startReviewLoopOnTides,
  withTestRunSetup,
  WRITES_DRAFT,
} from "./test-run-session.fixtures.js";

describe("state", () => {
  it("offers approved as a button and changes_requested with review_feedback required at 002-review-1 once write has succeeded", async () => {
    await withTestRunSetup(WRITES_DRAFT, async (setup) => {
      const session = await startReviewLoopOnTides(setup);

      await session.idle();

      expect(session.state().actions).toEqual({
        "002-review-1": standInActionsOf(reviewLoopLine, "review"),
      });
    });
  }, 10_000);
});
