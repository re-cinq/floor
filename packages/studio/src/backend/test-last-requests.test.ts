import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { answerFrame } from "./requests.js";
import { startReviewLoop, withRememberedSetup, type TestRunContext } from "./test-run-session.fixtures.js";

afterEach(() => vi.unstubAllEnvs());

describe("test.last", () => {
  it("answers null for review-loop when nothing is remembered", async () => {
    await withRememberedSetup(async ({ context }) => {
      expect(await lastFor("review-loop", context)).toEqual({ id: "t2", type: "result", result: null });
    });
  });

  it("answers the workspace and topic tides review-loop was last started with", async () => {
    await withRememberedSetup(async ({ context, workspace }) => {
      await startReviewLoop(workspace, context);

      expect(await lastFor("review-loop", context)).toEqual({
        id: "t2",
        type: "result",
        result: { workspace, entered: { topic: "tides" } },
      });
    });
  });

  it("answers null for review-loop when the remembered file is not json", async () => {
    await withRememberedSetup(async ({ context, configFolder }) => {
      mkdirSync(join(configFolder, "floor-studio"));
      writeFileSync(join(configFolder, "floor-studio", "last-tests.json"), "{not json");

      expect(await lastFor("review-loop", context)).toEqual({ id: "t2", type: "result", result: null });
    });
  });

  it("answers null for review-loop when its start was refused for the relative workspace runs", async () => {
    await withRememberedSetup(async ({ context }) => {
      await startReviewLoop("runs", context);

      expect(await lastFor("review-loop", context)).toEqual({ id: "t2", type: "result", result: null });
    });
  });

  it("answers null for other-line when only review-loop was started", async () => {
    await withRememberedSetup(async ({ context, workspace }) => {
      await startReviewLoop(workspace, context);

      expect(await lastFor("other-line", context)).toEqual({ id: "t2", type: "result", result: null });
    });
  });

  it("answers the run and folder of review-loop's start when the config folder cannot be created", async () => {
    await withRememberedSetup(async ({ context, workspace, configFolder }) => {
      writeFileSync(join(configFolder, "floor-studio"), "a file where the folder should be");

      expect(await startReviewLoop(workspace, context)).toEqual({ id: "t1", type: "result", result: { run: expect.any(String), folder: expect.any(String) } });
    });
  });
});

function lastFor(line: string, context: TestRunContext): ReturnType<typeof answerFrame> {
  return answerFrame(JSON.stringify({ id: "t2", type: "test.last", line }), context);
}
