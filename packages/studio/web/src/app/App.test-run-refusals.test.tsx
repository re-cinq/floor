// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { readdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { WRITES_DRAFT } from "../../../src/backend/test-run-session.fixtures";
import { closeStudios } from "./app-page.fixtures";
import { findWaitingReview, openedFolders, startReviewLoop, withScratchWorkspace } from "./test-run-page.fixtures";

afterEach(closeStudios);

async function refuseGoneVisitFolder(workspace: string): Promise<{ runFolder: string; visitFolder: string }> {
  await startReviewLoop(workspace);
  await findWaitingReview();
  const [runName] = readdirSync(workspace);
  const visitFolder = join(workspace, runName, "visits", "001-write-1");
  rmSync(visitFolder, { recursive: true });
  await userEvent.click(await screen.findByRole("button", { name: "Open visit folder 001-write-1" }));
  await screen.findByRole("alert");

  return { runFolder: join(workspace, runName), visitFolder };
}

describe("App test locally refusals", () => {
  it("shows the backend's reason and opens nothing when the folder of visit 001-write-1 is gone from disk", async () => {
    await withScratchWorkspace(WRITES_DRAFT, async (workspace, opened) => {
      const { visitFolder } = await refuseGoneVisitFolder(workspace);

      expect({ alert: (await screen.findByRole("alert")).textContent, opened }).toEqual({ alert: `${visitFolder} is not a folder`, opened: [] });
    });
  });

  it("clears the refusal when Open run folder succeeds after the refused Open visit folder 001-write-1", async () => {
    await withScratchWorkspace(WRITES_DRAFT, async (workspace, opened) => {
      const { runFolder } = await refuseGoneVisitFolder(workspace);

      await userEvent.click(await screen.findByRole("button", { name: "Open run folder" }));

      expect({ alert: screen.queryByRole("alert"), opened: await openedFolders(opened) }).toEqual({ alert: null, opened: [runFolder] });
    });
  });
});
