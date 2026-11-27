// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { mkdirSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { fakeClaudeScratch } from "../../../src/backend/studio.fixtures";
import { WRITES_ITS_PROMPT } from "../../../src/backend/test-run-session.fixtures";
import { closeStudios, openPage } from "./app-page.fixtures";
import { findWaitingReview, startReviewLoop } from "./test-run-page.fixtures";

afterEach(closeStudios);

const EXAMPLE_FOLDER = resolve(__dirname, "../../../../../examples/cookbook/review-loop");
const REASON = "Cut the second paragraph; it repeats the first.";
const TWENTY_SECONDS = 20_000;

describe("App review-loop cookbook example, tested locally", () => {
  it("finishes with the first draft kept and 002-review-1 approved when approved is clicked", async () => {
    await withExampleRun(async (workspace) => {
      await findWaitingReview();

      await userEvent.click(await screen.findByRole("button", { name: "approved" }));

      const status = (await screen.findByText("finished")).textContent;
      const runFolder = runFolderOf(workspace);
      expect({
        status,
        draft: readFileSync(join(runFolder, "visits/001-write-1/outputs/draft.md"), "utf8").length > 0,
        decision: visitRecord(runFolder, "002-review-1").outcome,
        timeline: timelineTypes(runFolder),
      }).toEqual({
        status: "finished",
        draft: true,
        decision: "approved",
        timeline: ["run_started", "visit_opened", "visit_reported", "visit_opened", "visit_reported", "run_settled"],
      });
    });
  }, TWENTY_SECONDS);

  it("hands the reason to 003-write-2 and keeps the first draft when changes_requested is sent with a reason", async () => {
    await withExampleRun(async (workspace) => {
      await findWaitingReview();
      await userEvent.type(await screen.findByRole("textbox", { name: "review_feedback" }), REASON);
      await userEvent.click(await screen.findByRole("button", { name: "changes_requested" }));
      await screen.findByRole("row", { name: /004-review-2.*waiting/ });
      await userEvent.click(await screen.findByRole("button", { name: "approved" }));
      await screen.findByText("finished");

      const runFolder = runFolderOf(workspace);
      const visits = ["001-write-1", "002-review-1", "003-write-2", "004-review-2"].map((id) => visitRecord(runFolder, id));
      expect({
        feedback: readJson(join(runFolder, "visits/003-write-2/inputs.json")),
        promptHasReason: readFileSync(join(runFolder, "visits/003-write-2/prompt.md"), "utf8").includes(REASON),
        firstDraftHasReason: readFileSync(join(runFolder, "visits/001-write-1/outputs/draft.md"), "utf8").includes(REASON),
        review: visits[1],
        agentCosts: [visits[0], visits[2]],
        durations: visits,
      }).toMatchObject({
        feedback: { feedback: REASON },
        promptHasReason: true,
        firstDraftHasReason: false,
        review: { outcome: "changes_requested", produced: { review_feedback: REASON } },
        agentCosts: [{ costUsd: expect.any(Number) }, { costUsd: expect.any(Number) }],
        durations: visits.map(() => ({ durationMs: expect.any(Number) })),
      });
    });
  }, TWENTY_SECONDS);
});

async function withExampleRun(body: (workspace: string) => Promise<void>): Promise<void> {
  const { scratch, runEnv } = fakeClaudeScratch("floor-test-review-loop-", WRITES_ITS_PROMPT);

  try {
    const workspace = join(scratch, "workspace");
    mkdirSync(workspace);
    await openPage(exampleFiles(), { hash: "&line=review-loop", runEnv, openFolder: () => undefined });
    await userEvent.click(await screen.findByRole("button", { name: "Test locally" }));
    await startReviewLoop(workspace);
    await body(workspace);
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function exampleFiles(): { path: string; text: string }[] {
  return ["assembly-line.yaml", "agents/draft-writer.md"].map((file) => ({
    path: `review-loop/${file}`,
    text: readFileSync(join(EXAMPLE_FOLDER, file), "utf8"),
  }));
}

function runFolderOf(workspace: string): string {
  const [runFolder] = readdirSync(workspace);

  return join(workspace, runFolder);
}

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, "utf8"));
}

function visitRecord(runFolder: string, visitId: string): Record<string, unknown> {
  return readJson(join(runFolder, "visits", visitId, "visit.json"));
}

function timelineTypes(runFolder: string): string[] {
  const lines = readFileSync(join(runFolder, "timeline.jsonl"), "utf8").trim().split("\n");

  return lines.map((line) => JSON.parse(line).type);
}
