import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { answerFrame } from "./requests.js";
import { contextOver } from "./agent-run.fixtures.js";
import { settleRunOnDisk, startedFolderOf, startReviewLoop, withRememberedSetup } from "./test-run-session.fixtures.js";

afterEach(() => vi.unstubAllEnvs());

const listRequest = { id: "t4", type: "test.list" };

const runOf = (started: unknown): string => (started as { result: { run: string } }).result.run;

async function expectNothingListedAfterRestart(spoil: (placed: { folder: string; workspace: string }) => void): Promise<void> {
  await withRememberedSetup(async ({ context, collectionDir, workspace }) => {
    spoil({ folder: startedFolderOf(await startReviewLoop(workspace, context)), workspace });
    const { context: restarted } = contextOver(collectionDir, context.runEnv);

    expect(await answerFrame(JSON.stringify(listRequest), restarted)).toEqual({ id: "t4", type: "result", result: [] });
  });
}

describe("test.list", () => {
  it("answers review-loop's run waiting after one start", async () => {
    await withRememberedSetup(async ({ context, workspace }) => {
      const started = await startReviewLoop(workspace, context);
      const { run, folder } = (started as { result: { run: string; folder: string } }).result;

      expect(await answerFrame(JSON.stringify({ id: "t2", type: "test.list" }), context)).toEqual({
        id: "t2",
        type: "result",
        result: [{ run, line: "review-loop", folder, status: "waiting", startedAt: expect.any(String) }],
      });
    });
  });

  it("answers the second run before the first when two runs start one after the other", async () => {
    await withRememberedSetup(async ({ context, workspace }) => {
      const first = await startReviewLoop(workspace, context);
      const otherWorkspace = join(dirname(workspace), "other-workspace");
      mkdirSync(otherWorkspace);
      const second = await startReviewLoop(otherWorkspace, context);

      const listings = await answerFrame(JSON.stringify({ id: "t3", type: "test.list" }), context);

      expect((listings as { result: { run: string }[] }).result.map((listing) => listing.run)).toEqual([runOf(second), runOf(first)]);
    });
  });

  it("answers review-loop's waiting run stopped in a fresh context after a restart", async () => {
    await withRememberedSetup(async ({ context, collectionDir, workspace }) => {
      const folder = startedFolderOf(await startReviewLoop(workspace, context));
      const { context: restarted } = contextOver(collectionDir, context.runEnv);

      expect(await answerFrame(JSON.stringify({ id: "t3", type: "test.list" }), restarted)).toEqual({
        id: "t3",
        type: "result",
        result: [{ run: folder, line: "review-loop", folder, status: "stopped", startedAt: expect.any(String) }],
      });
    });
  });

  it("lists review-loop's settled run as settled with its finished ending after a restart", async () => {
    await withRememberedSetup(async ({ context, collectionDir, workspace }) => {
      const folder = startedFolderOf(await startReviewLoop(workspace, context));
      settleRunOnDisk(folder);
      const { context: restarted } = contextOver(collectionDir, context.runEnv);

      expect(await answerFrame(JSON.stringify(listRequest), restarted)).toEqual({
        id: "t4",
        type: "result",
        result: [{ run: folder, line: "review-loop", folder, status: "settled", startedAt: expect.any(String), ending: { outcome: "finished" } }],
      });
    });
  });

  it("answers one listing for a run both live and on disk", async () => {
    await withRememberedSetup(async ({ context, workspace }) => {
      const started = await startReviewLoop(workspace, context);

      expect(await answerFrame(JSON.stringify(listRequest), context)).toEqual({
        id: "t4",
        type: "result",
        result: [{ run: runOf(started), line: "review-loop", folder: startedFolderOf(started), status: "waiting", startedAt: expect.any(String) }],
      });
    });
  });

  it("answers [] in a fresh context when the remembered workspace was deleted", async () => {
    await expectNothingListedAfterRestart(({ workspace }) => rmSync(workspace, { recursive: true, force: true }));
  });

  it("answers [] in a fresh context when run.json is not json", async () => {
    await expectNothingListedAfterRestart(({ folder }) => writeFileSync(join(folder, "run.json"), "{not json"));
  });
});
