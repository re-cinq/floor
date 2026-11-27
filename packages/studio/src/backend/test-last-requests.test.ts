import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { answerFrame } from "./requests.js";
import { WRITES_DRAFT, withTestRunSetup, type TestRunSetup } from "./test-run-session.fixtures.js";

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

type Context = TestRunSetup["context"];

function lastFor(line: string, context: Context): ReturnType<typeof answerFrame> {
  return answerFrame(JSON.stringify({ id: "t2", type: "test.last", line }), context);
}

async function startReviewLoop(workspace: string, context: Context): ReturnType<typeof answerFrame> {
  const start = { id: "t1", type: "test.start", line: "review-loop", workspace, entered: { topic: "tides" }, permission: "acceptEdits" };
  const answer = await answerFrame(JSON.stringify(start), context);

  await Promise.all([...context.testRuns.values()].map((session) => session.idle()));

  return answer;
}

async function withRememberedSetup(body: (setup: TestRunSetup & { configFolder: string }) => Promise<void>): Promise<void> {
  const configFolder = mkdtempSync(join(tmpdir(), "floor-last-tests-"));

  vi.stubEnv("XDG_CONFIG_HOME", configFolder);

  try {
    await withTestRunSetup(WRITES_DRAFT, (setup) => body({ ...setup, configFolder }));
  } finally {
    rmSync(configFolder, { recursive: true, force: true });
  }
}
