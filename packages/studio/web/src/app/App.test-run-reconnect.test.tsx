// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { WRITES_DRAFT } from "../../../src/backend/test-run-session.fixtures";
import { REVIEW_LOOP_COLLECTION } from "../../../src/backend/test-run.fixtures";
import { closeStudios } from "./app-page.fixtures";
import { startSocketRelay, untilRelayed } from "./socket-relay.fixtures";
import { cellsOf, findWaitingReview, secondClientOf, startReviewLoop, untilFrame, withScratchWorkspace } from "./test-run-page.fixtures";

afterEach(closeStudios);

const SECOND_PAGE_SOCKET = 2;

describe("App test locally, run screen after the socket drops", () => {
  it("shows 002-review-1 approved when it was reported while the page was cut off", async () => {
    const relay = await startSocketRelay();

    try {
      await withScratchWorkspace(
        WRITES_DRAFT,
        async (workspace, opened, studio) => {
          await startReviewLoop(workspace);
          await findWaitingReview();

          const run = new URLSearchParams(window.location.hash.slice(1)).get("test") ?? "";
          const { connection, frames } = await secondClientOf(studio);

          try {
            relay.cut();
            await connection.reportTest({ run, visit: "002-review-1", outcome: "approved", produced: {} });
            await untilFrame(frames, run, "settled");
            relay.mend();
            await untilRelayed(relay, SECOND_PAGE_SOCKET);

            const row = await screen.findByRole("row", { name: /002-review-1.*approved/ });

            expect(cellsOf(row)).toEqual(["002-review-1", "review", "approved", "", "not stated", "Open"]);
          } finally {
            connection.close();
          }
        },
        REVIEW_LOOP_COLLECTION,
        relay.through,
      );
    } finally {
      await relay.close();
    }
  }, 20_000);
});
