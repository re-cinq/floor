import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { answerFrame } from "./requests.js";
import { contextOver } from "./agent-run.fixtures.js";
import { settleRunOnDisk, startedFolderOf, startReviewLoop, withRememberedSetup } from "./test-run-session.fixtures.js";

afterEach(() => vi.unstubAllEnvs());

interface Answer {
  result?: { folder: string; lineId: string; status: string; ending?: { outcome: string }; actions: unknown; visits: { id: string; report?: { outcome: string } }[] };
}

interface RunPaths {
  workspace: string;
  foreignFolder: string;
}

const readAnswer = async (run: string, context: Parameters<typeof answerFrame>[1]): Promise<Answer> =>
  (await answerFrame(JSON.stringify({ id: "r1", type: "test.read", run }), context)) as Answer;

describe("test.read of a past run", () => {
  it("answers review-loop's stopped state with 001-write-1 success and 002-review-1 unreported after a restart", async () => {
    await withRememberedSetup(async ({ context, collectionDir, workspace }) => {
      const folder = startedFolderOf(await startReviewLoop(workspace, context));
      const restarted = contextOver(collectionDir, context.runEnv).context;

      const { result } = await readAnswer(folder, restarted);

      expect({ ...result, visits: result?.visits.map(({ id, report }) => [id, report?.outcome ?? null]) }).toEqual({
        folder,
        lineId: "review-loop",
        status: "stopped",
        actions: {},
        visits: [
          ["001-write-1", "success"],
          ["002-review-1", null],
        ],
      });
    });
  });

  it("answers review-loop's settled state with its finished ending after a restart", async () => {
    await withRememberedSetup(async ({ context, collectionDir, workspace }) => {
      const folder = startedFolderOf(await startReviewLoop(workspace, context));
      settleRunOnDisk(folder);
      const restarted = contextOver(collectionDir, context.runEnv).context;

      const { result } = await readAnswer(folder, restarted);

      expect(result).toMatchObject({ folder, lineId: "review-loop", status: "settled", ending: { outcome: "finished" } });
    });
  });

  it.each([
    { label: "a review-loop run folder the studio does not remember", runOf: ({ foreignFolder }: RunPaths) => foreignFolder },
    { label: "a path climbing out of the remembered workspace", runOf: ({ workspace }: RunPaths) => join(workspace, "..", "..", "etc") },
    { label: "the relative path review-loop-20261127-000000", runOf: () => "review-loop-20261127-000000" },
  ])("refuses with 'there is no test run <id>' for $label after a restart", async ({ runOf }) => {
    await withRememberedSetup(async ({ context, collectionDir, workspace }) => {
      const folder = startedFolderOf(await startReviewLoop(workspace, context));
      const scratch = mkdtempSync(join(tmpdir(), "floor-foreign-run-"));
      const foreignFolder = join(scratch, "review-loop-20261127-000000");

      try {
        cpSync(folder, foreignFolder, { recursive: true });
        const run = runOf({ workspace, foreignFolder });

        const answer = await answerFrame(JSON.stringify({ id: "r1", type: "test.read", run }), contextOver(collectionDir, context.runEnv).context);

        expect(answer).toEqual({ id: "r1", type: "refused", reason: `there is no test run ${run}` });
      } finally {
        rmSync(scratch, { recursive: true, force: true });
      }
    });
  });
});
