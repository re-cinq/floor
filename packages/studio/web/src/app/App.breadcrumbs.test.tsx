// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { REVIEW_LOOP_COLLECTION } from "../../../src/backend/test-run.fixtures";
import { openPage } from "./app-page.fixtures";
import { WRITES_DRAFT } from "../../../src/backend/test-run-session.fixtures";
import { closeStudios } from "./app-page.fixtures";
import { findWaitingReview, openStartScreen, startReviewLoop, withScratchWorkspace } from "./test-run-page.fixtures";

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

  it.each([
    { name: "no line is selected", hash: "", expected: [{ text: "COLLECTION", link: false }] },
    {
      name: "review-loop is selected",
      hash: "&line=review-loop",
      expected: [
        { text: "COLLECTION", link: true },
        { text: "review-loop", link: false },
      ],
    },
    {
      name: "review-loop's start screen is open",
      hash: "&line=review-loop&test=new",
      expected: [
        { text: "COLLECTION", link: true },
        { text: "review-loop", link: true },
        { text: "Test locally", link: false },
      ],
    },
  ])("trails $name", async ({ hash, expected }) => {
    await openPage([...REVIEW_LOOP_COLLECTION], { hash });

    const sidebar = await screen.findByRole("complementary", { name: "Collection" });
    const trail = within(await screen.findByRole("navigation", { name: "Breadcrumbs" }));

    await waitFor(() =>
      expect(
        trail.getAllByRole("listitem").map((crumb) => ({ text: crumb.textContent, link: within(crumb).queryByRole("link") !== null })),
      ).toEqual(expected.map((crumb) => ({ ...crumb, text: crumb.text === "COLLECTION" ? sidebar.querySelector("p")?.textContent : crumb.text }))),
    );
  });

  it("marks only Test locally as the current page on the start screen", async () => {
    await openStartScreen();

    const trail = within(await screen.findByRole("navigation", { name: "Breadcrumbs" }));

    await waitFor(() =>
      expect(trail.getAllByRole("listitem").map((crumb) => crumb.querySelector("[aria-current]")?.textContent ?? null)).toEqual([
        null,
        null,
        "Test locally",
      ]),
    );
  });

  it("shows the line screen without test in the hash when the review-loop crumb is clicked", async () => {
    await openStartScreen();

    await userEvent.click(await screen.findByRole("link", { name: "review-loop" }));

    await waitFor(() =>
      expect({
        testLocally: screen.queryByRole("button", { name: "Test locally" }) !== null,
        test: new URLSearchParams(window.location.hash.slice(1)).get("test"),
      }).toEqual({ testLocally: true, test: null }),
    );
  });
});
