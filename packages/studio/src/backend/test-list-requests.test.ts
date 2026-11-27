import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { answerFrame } from "./requests.js";
import { startReviewLoop, withRememberedSetup } from "./test-run-session.fixtures.js";

afterEach(() => vi.unstubAllEnvs());

const runOf = (started: unknown): string => (started as { result: { run: string } }).result.run;

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
});
