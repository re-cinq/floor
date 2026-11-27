import { afterEach, describe, expect, it, vi } from "vitest";
import { answerFrame } from "./requests.js";
import { startReviewLoop, withRememberedSetup } from "./test-run-session.fixtures.js";

afterEach(() => vi.unstubAllEnvs());

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
});
