// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { WRITES_DRAFT } from "../../../src/backend/test-run-session.fixtures";
import { closeStudios } from "./app-page.fixtures";
import { findWaitingReview, startReviewLoop, withScratchWorkspace } from "./test-run-page.fixtures";

afterEach(closeStudios);

describe("App breadcrumbs", () => {
  it("trails collection folder, review-loop, Test locally and the run folder on a test run's screen", async () => {
    await withScratchWorkspace(WRITES_DRAFT, async (workspace) => {
      await startReviewLoop(workspace);
      await findWaitingReview();

      const sidebar = screen.getByRole("complementary", { name: "Collection" });
      const folderName = sidebar.querySelector("p")?.textContent;
      const trail = within(screen.getByRole("navigation", { name: "Breadcrumbs" }));

      expect(
        trail.getAllByRole("listitem").map((crumb) => ({ text: crumb.textContent, link: within(crumb).queryByRole("link") !== null })),
      ).toEqual([
        { text: folderName, link: true },
        { text: "review-loop", link: true },
        { text: "Test locally", link: true },
        { text: expect.stringMatching(/^review-loop-/), link: false },
      ]);
    });
  });
});
