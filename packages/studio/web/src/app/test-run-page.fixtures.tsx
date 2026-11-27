import type { CollectionFile } from "@re-cinq/floor-pipeline";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { screen, waitFor, within } from "@testing-library/react";
import { expect } from "vitest";
import { StudioConnection, type TestChangedFrame } from "../socket/studio-connection";
import userEvent from "@testing-library/user-event";
import { REVIEW_LOOP_COLLECTION } from "../../../src/backend/test-run.fixtures";
import { fakeClaudeScratch } from "../../../src/backend/studio.fixtures";
import { openPage, type OpenedPage } from "./app-page.fixtures";

export async function openStartScreen(
  runEnv?: Record<string, string>,
  openFolder?: (path: string) => void,
  collection: readonly CollectionFile[] = REVIEW_LOOP_COLLECTION,
): Promise<OpenedPage> {
  return openPage([...collection], { hash: "&line=review-loop&test=new", runEnv, openFolder });
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

export async function alertGone(): Promise<null> {
  return waitFor(() => (screen.queryByRole("alert") === null ? null : Promise.reject(new Error("the alert is still shown"))));
}

export async function openedFolders(opened: string[]): Promise<string[]> {
  return waitFor(() => (opened.length > 0 ? opened : Promise.reject(new Error("nothing opened yet"))));
}

export async function secondClientOf(studio: OpenedPage["studio"]): Promise<{ connection: StudioConnection; frames: TestChangedFrame[] }> {
  const connection = new StudioConnection({ socket: studio.url, token: studio.token });
  const frames: TestChangedFrame[] = [];

  connection.onTestChanged((frame) => frames.push(frame));
  connection.start();
  await waitFor(() => {
    const { status } = connection.snapshot().connection;
    expect(status).toBe("open");
  });

  return { connection, frames };
}

export async function untilFrame(frames: TestChangedFrame[], run: string, status: string): Promise<void> {
  await waitFor(() => expect(frames.some((frame) => frame.run === run && frame.state.status === status)).toBe(true), { timeout: 10_000 });
}

const PAGE_CATCHES_UP_MS = 200;

// The page shows no sign of having received another run's frames; the pause can only let a broken filter pass, never fail a correct one.
export async function pageCatchesUp(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, PAGE_CATCHES_UP_MS));
}

export async function withScratchWorkspace(
  script: string,
  body: (workspace: string, opened: string[], studio: OpenedPage["studio"]) => Promise<void>,
  collection: readonly CollectionFile[] = REVIEW_LOOP_COLLECTION,
): Promise<void> {
  const { scratch, runEnv } = fakeClaudeScratch("floor-test-page-", script);

  try {
    const workspace = join(scratch, "workspace");
    mkdirSync(workspace);
    const opened: string[] = [];
    const { studio } = await openStartScreen(runEnv, (path) => opened.push(path), collection);
    await body(workspace, opened, studio);
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
