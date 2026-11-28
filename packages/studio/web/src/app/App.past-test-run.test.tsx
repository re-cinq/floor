// @vitest-environment jsdom
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { cleanup, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { fakeClaudeScratch } from "../../../src/backend/studio.fixtures";
import { WRITES_DRAFT } from "../../../src/backend/test-run-session.fixtures";
import { closeStudios, openPage } from "./app-page.fixtures";
import { findWaitingReview, openStartScreen, startReviewLoop } from "./test-run-page.fixtures";
import { REVIEW_LOOP_COLLECTION } from "../../../src/backend/test-run.fixtures";

afterEach(closeStudios);

describe("App test run opened after a studio restart", () => {
  it("shows review-loop and its unreported visit as stopped with no Cancel and no Waiting for you", async () => {
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

      expect({
        stopped: (await screen.findAllByText("stopped")).map((element) => element.tagName),
        cancel: screen.queryByRole("button", { name: "Cancel" }),
        waiting: screen.queryByRole("heading", { name: "Waiting for you" }),
      }).toEqual({ stopped: ["P", "TD"], cancel: null, waiting: null });
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  }, 20_000);
});
