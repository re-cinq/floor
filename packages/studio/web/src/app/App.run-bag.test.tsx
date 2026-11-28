// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { WRITES_DRAFT } from "../../../src/backend/test-run-session.fixtures";
import { closeStudios } from "./app-page.fixtures";
import { bagRowsOf, findWaitingReview, startReviewLoop, withScratchWorkspace } from "./test-run-page.fixtures";

afterEach(closeStudios);

describe("App test locally, run screen's Bag", () => {
  it("lists topic from start and draft from 001-write-1 in the Bag table while 002-review-1 waits", async () => {
    await withScratchWorkspace(WRITES_DRAFT, async (workspace) => {
      await startReviewLoop(workspace);
      await findWaitingReview();
      const table = await screen.findByRole("table", { name: "Bag" });

      const bag = bagRowsOf(table);

      expect(bag).toEqual([
        { name: "topic", kind: "value", value: "tides", by: "start" },
        { name: "draft", kind: "file", value: expect.stringMatching(/visits\/001-write-1\/outputs\/draft\.md$/), by: "001-write-1" },
      ]);
    });
  }, 20_000);
});
