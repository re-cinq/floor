import type { CollectionFile } from "@re-cinq/floor-pipeline";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { REVIEW_LOOP_COLLECTION } from "../../../src/backend/test-run.fixtures";
import { fakeClaudeScratch } from "../../../src/backend/studio.fixtures";
import { openPage } from "./app-page.fixtures";

export async function openStartScreen(
  runEnv?: Record<string, string>,
  openFolder?: (path: string) => void,
  collection: readonly CollectionFile[] = REVIEW_LOOP_COLLECTION,
): Promise<void> {
  await openPage([...collection], { hash: "&line=review-loop&test=new", runEnv, openFolder });
}

export async function startReviewLoop(workspace: string): Promise<void> {
  await userEvent.type(await screen.findByRole("textbox", { name: "topic" }), "tides");
  await userEvent.type(await screen.findByRole("textbox", { name: "Workspace folder" }), workspace);
  await userEvent.click(await screen.findByRole("button", { name: "Start" }));
}

export async function findWaitingReview(): Promise<HTMLElement> {
  return screen.findByRole("row", { name: /002-review-1.*waiting/ });
}

export function cellsOf(row: HTMLElement): string[] {
  return within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent);
}

export function marksOfCard(nodeId: string): Record<string, string | null | undefined> {
  const card = document.querySelector(`[data-node="${nodeId}"]`);

  return {
    visited: card?.getAttribute("data-visited"),
    outcome: card?.getAttribute("data-outcome"),
    waiting: card?.getAttribute("data-waiting"),
  };
}

export async function openedFolders(opened: string[]): Promise<string[]> {
  return waitFor(() => (opened.length > 0 ? opened : Promise.reject(new Error("nothing opened yet"))));
}

export async function withScratchWorkspace(
  script: string,
  body: (workspace: string, opened: string[]) => Promise<void>,
  collection: readonly CollectionFile[] = REVIEW_LOOP_COLLECTION,
): Promise<void> {
  const { scratch, runEnv } = fakeClaudeScratch("floor-test-page-", script);

  try {
    const workspace = join(scratch, "workspace");
    mkdirSync(workspace);
    const opened: string[] = [];
    await openStartScreen(runEnv, (path) => opened.push(path), collection);
    await body(workspace, opened);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export async function withScratchFolder(body: (scratch: string) => Promise<void>): Promise<void> {
  const scratch = mkdtempSync(join(tmpdir(), "floor-folder-picker-"));

  try {
    await body(scratch);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
