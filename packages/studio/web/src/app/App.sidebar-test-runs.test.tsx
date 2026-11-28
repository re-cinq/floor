// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { WRITES_DRAFT } from "../../../src/backend/test-run-session.fixtures";
import { closeStudios } from "./app-page.fixtures";
import { findWaitingReview, startReviewLoop, withScratchWorkspace } from "./test-run-page.fixtures";

afterEach(closeStudios);

function badgeNamesOf(lineName: RegExp): string[] {
  const lines = within(screen.getByRole("navigation", { name: "Assembly lines" }));
  const link = lines.getByRole("link", { name: lineName });

  return [...link.querySelectorAll("[aria-label]")].map((badge) => badge.getAttribute("aria-label") ?? "").filter((name) => name.includes("test run"));
}

describe("App sidebar, test runs in progress", () => {
  it("badges review-loop with 1 test run in progress while its run waits", async () => {
    await withScratchWorkspace(WRITES_DRAFT, async (workspace) => {
      await startReviewLoop(workspace);
      await findWaitingReview();

      await waitFor(() => expect(badgeNamesOf(/review-loop/)).toEqual(["1 test run in progress"]));
    });
  }, 20_000);
});
