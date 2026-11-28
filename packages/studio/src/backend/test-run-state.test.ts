import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { standInActionsOf } from "../test-run/stand-in-actions.js";
import { reviewLoopLine } from "../test-run/test-run.fixtures.js";
import {
  settleReviewLoopApproved,
  RUN_FOLDER,
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

  it("offers no actions once 002-review-1 has reported approved", async () => {
    await withTestRunSetup(WRITES_DRAFT, async (setup) => {
      const session = await settleReviewLoopApproved(setup);

      expect(session.state().actions).toEqual({});
    });
  }, 10_000);

  it("holds topic tides from start and draft from 001-write-1 at 002-review-1", async () => {
    await withTestRunSetup(WRITES_DRAFT, async (setup) => {
      const session = await startReviewLoopOnTides(setup);

      await session.idle();

      expect(session.state().bag).toEqual([
        { name: "topic", kind: "value", ref: "tides", by: "start" },
        { name: "draft", kind: "file", ref: join(setup.workspace, RUN_FOLDER, "visits", "001-write-1", "outputs", "draft.md"), by: "001-write-1" },
      ]);
    });
  }, 10_000);
});
