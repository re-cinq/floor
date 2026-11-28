import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BagEntry } from "../test-run/test-run-state.js";
import { answerFrame } from "./requests.js";
import { contextOver } from "./agent-run.fixtures.js";
import { SNAPSHOT_FOLDER } from "./test-run-snapshot.js";
import { settleRunOnDisk, startedFolderOf, startReviewLoop, withRememberedSetup } from "./test-run-session.fixtures.js";

afterEach(() => vi.unstubAllEnvs());

interface Answer {
  result?: { folder: string; lineId: string; status: string; ending?: { outcome: string }; actions: unknown; visits: { id: string; report?: { outcome: string } }[]; bag?: BagEntry[] };
}

interface RunPaths {
  workspace: string;
  foreignFolder: string;
}

const readAnswer = async (run: string, context: Parameters<typeof answerFrame>[1]): Promise<Answer> =>
  (await answerFrame(JSON.stringify({ id: "r1", type: "test.read", run }), context)) as Answer;

const withPastRunRead = async (
  beforeRestart: (folder: string) => void,
  body: (past: { folder: string; result: Answer["result"] }) => void,
): Promise<void> =>
  withRememberedSetup(async ({ context, collectionDir, workspace }) => {
    const folder = startedFolderOf(await startReviewLoop(workspace, context));
    beforeRestart(folder);

    const { result } = await readAnswer(folder, contextOver(collectionDir, context.runEnv).context);

    body({ folder, result });
  });

const keepAsIs = (): void => undefined;

describe("test.read of a past run", () => {
  it("answers review-loop's stopped state with 001-write-1 success and 002-review-1 unreported after a restart", async () => {
    await withPastRunRead(keepAsIs, ({ folder, result }) => {
      expect({
        folder: result?.folder,
        lineId: result?.lineId,
        status: result?.status,
        actions: result?.actions,
        visits: result?.visits.map(({ id, report }) => [id, report?.outcome ?? null]),
      }).toEqual({
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

  it("answers review-loop's past bag with topic from the start and draft by 001-write-1 after a restart", async () => {
    await withPastRunRead(keepAsIs, ({ folder, result }) => {
      expect(result?.bag).toEqual([
        { name: "topic", kind: "value", ref: "tides", by: "start" },
        { name: "draft", kind: "file", ref: join(folder, "visits", "001-write-1", "outputs", "draft.md"), by: "001-write-1" },
      ]);
    });
  });

  it("answers review-loop's past state without a bag when its definitions folder is gone after a restart", async () => {
    await withPastRunRead(
      (folder) => rmSync(join(folder, SNAPSHOT_FOLDER), { recursive: true, force: true }),
      ({ result }) => {
        expect({ status: result?.status, visits: result?.visits.length, hasBag: result !== undefined && "bag" in result }).toEqual({
          status: "stopped",
          visits: 2,
          hasBag: false,
        });
      },
    );
  });

  it("answers review-loop's settled state with its finished ending after a restart", async () => {
    await withPastRunRead(settleRunOnDisk, ({ folder, result }) => {
      expect(result).toMatchObject({ folder, lineId: "review-loop", status: "settled", ending: { outcome: "finished" } });
    });
  });

  it("opens review-loop's past run folder after a restart", async () => {
    await withRememberedSetup(async ({ context, collectionDir, workspace }) => {
      const folder = startedFolderOf(await startReviewLoop(workspace, context));
      const restarted = contextOver(collectionDir, context.runEnv);

      const answer = await answerFrame(JSON.stringify({ id: "r1", type: "folder.open", path: folder }), restarted.context);

      expect({ answer, opened: restarted.opened }).toEqual({ answer: { id: "r1", type: "result", result: { opened: folder } }, opened: [folder] });
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
