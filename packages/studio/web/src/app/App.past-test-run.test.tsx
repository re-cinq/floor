// @vitest-environment jsdom
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { fakeClaudeScratch } from "../../../src/backend/studio.fixtures";
import { WRITES_DRAFT } from "../../../src/backend/test-run-session.fixtures";
import { closeStudios, openPage } from "./app-page.fixtures";
import { bagRowsOf, findWaitingReview, openStartScreen, startReviewLoop } from "./test-run-page.fixtures";
import { REVIEW_LOOP_COLLECTION } from "../../../src/backend/test-run.fixtures";

afterEach(closeStudios);

async function reopenStoppedRun(whenOpen: () => Promise<void>): Promise<void> {
  const { scratch, runEnv } = fakeClaudeScratch("floor-past-run-", WRITES_DRAFT);

  try {
    const workspace = join(scratch, "workspace");
    mkdirSync(workspace);
    const { dir, studio } = await openStartScreen(runEnv);
    await startReviewLoop(workspace);
    await findWaitingReview();
    await studio.close();
    cleanup();

    await openPage(REVIEW_LOOP_COLLECTION.slice(), { dir, hash: "&line=review-loop", runEnv });
    const runsList = await screen.findByRole("list", { name: "Test runs" });
    await userEvent.click(await within(runsList).findByRole("button", { name: /^stopped/ }));
    await whenOpen();
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

describe("App test run opened after a studio restart", () => {
  it("shows review-loop and its unreported visit as stopped with no Cancel and no Waiting for you", async () => {
    await reopenStoppedRun(async () => {
      expect({
        stopped: (await screen.findAllByText("stopped")).map((element) => element.tagName),
        cancel: screen.queryByRole("button", { name: "Cancel" }),
        waiting: screen.queryByRole("heading", { name: "Waiting for you" }),
      }).toEqual({ stopped: ["P", "TD"], cancel: null, waiting: null });
    });
  }, 20_000);

  it("shows the Bag table of a past review-loop run with topic tides by start and draft by 001-write-1", async () => {
    await reopenStoppedRun(async () => {
      const table = await screen.findByRole("table", { name: "Bag" });

      expect(bagRowsOf(table)).toEqual([
        { name: "topic", kind: "value", value: "tides", by: "start" },
        { name: "draft", kind: "file", value: expect.stringMatching(/visits\/001-write-1\/outputs\/draft\.md$/), by: "001-write-1" },
      ]);
    });
  }, 20_000);
});
