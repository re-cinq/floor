import { afterEach, describe, expect, it, vi } from "vitest";
import { answerFrame } from "./requests.js";
import { contextOver } from "./agent-run.fixtures.js";
import { startReviewLoop, withRememberedSetup } from "./test-run-session.fixtures.js";

afterEach(() => vi.unstubAllEnvs());

interface Answer {
  result?: { folder: string; lineId: string; status: string; actions: unknown; visits: { id: string; report?: { outcome: string } }[] };
}

const readAnswer = async (run: string, context: Parameters<typeof answerFrame>[1]): Promise<Answer> =>
  (await answerFrame(JSON.stringify({ id: "r1", type: "test.read", run }), context)) as Answer;

describe("test.read of a past run", () => {
  it("answers review-loop's stopped state with 001-write-1 success and 002-review-1 unreported after a restart", async () => {
    await withRememberedSetup(async ({ context, collectionDir, workspace }) => {
      const { folder } = ((await startReviewLoop(workspace, context)) as { result: { folder: string } }).result;
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
});
