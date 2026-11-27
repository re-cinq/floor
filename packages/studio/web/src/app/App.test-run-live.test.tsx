// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { WRITES_DRAFT } from "../../../src/backend/test-run-session.fixtures";
import { closeStudios } from "./app-page.fixtures";
import { cellsOf, findWaitingReview, secondClientOf, pageCatchesUp, startReviewLoop, untilFrame, withScratchWorkspace } from "./test-run-page.fixtures";

afterEach(closeStudios);

describe("App test locally, run screen of one run", () => {
  it("keeps 002-review-1 waiting for run A while another run B on the same line finishes", async () => {
    await withScratchWorkspace(WRITES_DRAFT, async (workspace, opened, studio) => {
      await startReviewLoop(workspace);
      await findWaitingReview();

      const { connection, frames } = await secondClientOf(studio);

      try {
        const workspaceB = join(dirname(workspace), "workspace-b");
        mkdirSync(workspaceB);
        const { run } = await connection.startTest({ line: "review-loop", workspace: workspaceB, entered: { topic: "tides" }, permission: "acceptEdits" });
        await untilFrame(frames, run, "waiting");
        await connection.reportTest({ run, visit: "002-review-1", outcome: "approved", produced: {} });
        await untilFrame(frames, run, "settled");
        await pageCatchesUp();

        expect(cellsOf(await findWaitingReview())).toEqual(["002-review-1", "review", "waiting", "", "not stated", "Open"]);
      } finally {
        connection.close();
      }
    });
  }, 20_000);
});
