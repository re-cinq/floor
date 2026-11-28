// @vitest-environment jsdom
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import userEvent from "@testing-library/user-event";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { WORKER_COLLECTION } from "../../../src/backend/collection-view.fixtures";
import { REVIEW_LOOP_COLLECTION } from "../../../src/backend/test-run.fixtures";
import { WRITES_DRAFT } from "../../../src/backend/test-run-session.fixtures";
import { closeStudios, reloadPage } from "./app-page.fixtures";
import { findWaitingReview, pageCatchesUp, secondClientOf, startReviewLoop, withScratchWorkspace } from "./test-run-page.fixtures";

const configHome = mkdtempSync(join(tmpdir(), "floor-config-home-"));

afterEach(async () => {
  await closeStudios();
  vi.unstubAllEnvs();
});

afterAll(() => rmSync(configHome, { recursive: true, force: true }));

async function showRunsListOfWaitingRun(workspace: string): Promise<{ runsList: HTMLElement; run: string }> {
  await startReviewLoop(workspace);
  await findWaitingReview();

  const hash = new URLSearchParams(window.location.hash.slice(1));
  const run = hash.get("test") ?? "";
  hash.delete("test");
  window.location.hash = hash.toString();
  reloadPage();

  return { runsList: await screen.findByRole("list", { name: "Test runs" }), run };
}

function rowsOf(runsList: HTMLElement): (string | null)[] {
  return within(runsList)
    .getAllByRole("listitem")
    .map((row) => row.textContent);
}

describe("App line screen, test runs list", () => {
  it("lists the started review-loop run as waiting with its run folder name", async () => {
    vi.stubEnv("XDG_CONFIG_HOME", configHome);

    await withScratchWorkspace(WRITES_DRAFT, async (workspace) => {
      const { runsList } = await showRunsListOfWaitingRun(workspace);
      const rows = rowsOf(runsList);

      expect(rows).toEqual([expect.stringMatching(/^waiting.*review-loop-\d/)]);
    });
  }, 20_000);

  it("lists the run as finished when a second client approves its review", async () => {
    vi.stubEnv("XDG_CONFIG_HOME", configHome);

    await withScratchWorkspace(WRITES_DRAFT, async (workspace, openedFolders, studio) => {
      const { runsList, run } = await showRunsListOfWaitingRun(workspace);
      const { connection } = await secondClientOf(studio);

      try {
        await connection.reportTest({ run, visit: "002-review-1", outcome: "approved", produced: {} });

        await waitFor(() => expect(rowsOf(runsList)).toEqual([expect.stringMatching(/^finished.*review-loop-\d/)]));
      } finally {
        connection.close();
      }
    });
  }, 20_000);

  it("opens the run screen of review-loop when its row is clicked", async () => {
    vi.stubEnv("XDG_CONFIG_HOME", configHome);

    await withScratchWorkspace(WRITES_DRAFT, async (workspace) => {
      const { runsList, run } = await showRunsListOfWaitingRun(workspace);

      await userEvent.click(within(runsList).getByRole("button"));

      const heading = await screen.findByRole("heading", { name: "review-loop test run" });

      expect({ test: new URLSearchParams(window.location.hash.slice(1)).get("test"), heading: Boolean(heading) }).toEqual({ test: run, heading: true });
    });
  }, 20_000);

  it("shows no test runs on the flow line when only review-loop has a run", async () => {
    vi.stubEnv("XDG_CONFIG_HOME", configHome);

    await withScratchWorkspace(
      WRITES_DRAFT,
      async (workspace) => {
        await showRunsListOfWaitingRun(workspace);
        const hash = new URLSearchParams(window.location.hash.slice(1));
        hash.set("line", "flow");
        window.location.hash = hash.toString();
        reloadPage();
        await pageCatchesUp();

        expect(screen.queryByRole("list", { name: "Test runs" })).toBeNull();
      },
      [...REVIEW_LOOP_COLLECTION, ...WORKER_COLLECTION],
    );
  }, 20_000);
});
