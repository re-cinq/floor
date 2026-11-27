import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { contextOver } from "./agent-run.fixtures.js";
import { EVENT_REVIEW_COLLECTION, PINNED_REVIEWER_COLLECTION, REVIEW_LOOP_COLLECTION } from "./test-run.fixtures.js";
import { RUN_FOLDER, SLEEPS_THEN_WRITES, startReviewLoopOnTides, withTestRunSetup, WRITES_DRAFT, type TestRunSetup } from "./test-run-session.fixtures.js";
import type { TestRunState } from "../test-run/test-run-state.js";
import type { TestRunSession } from "./test-run-session.js";
import { answerFrame } from "./requests.js";
import { IDLE_CONTEXT } from "./requests.fixtures.js";
import { closeStartedStudios, collectionOnDisk, withFakeClaude, type Client } from "./studio.fixtures.js";

afterEach(closeStartedStudios);

const escaped = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

describe("test.start", () => {
  it(
    "answers test.start with the run and its folder in the workspace, then test.changed waiting at 002-review-1 after write succeeds, for review-loop on topic tides",
    async () => {
      await withFakeClaude(
        WRITES_DRAFT,
        async (client, folder) => {
          const { started, changed } = await startedReviewLoop(client, folder);
          const { status, visits } = changed.state;

          expect({
            started: started.result,
            waiting: {
              sameRun: changed.run === (started.result as { run: string }).run,
              status,
              visits: visits.map(({ id, report }) => [id, report?.outcome ?? null]),
            },
          }).toEqual({
            started: { run: expect.any(String), folder: expect.stringMatching(new RegExp(`^${escaped(folder)}/review-loop-\\d{8}-\\d{6}$`)) },
            waiting: { sameRun: true, status: "waiting", visits: [["001-write-1", "success"], ["002-review-1", null]] },
          });
        },
        REVIEW_LOOP_COLLECTION,
      );
    },
    10_000,
  );
});

describe("test.report", () => {
  it(
    "answers test.report approved for 002-review-1, after which test.read gives review-loop settled as finished",
    async () => {
      await withFakeClaude(
        WRITES_DRAFT,
        async (client, folder) => {
          const { changed } = await startedReviewLoop(client, folder);
          const { run } = changed;

          client.send({ id: "t2", type: "test.report", run, visit: "002-review-1", outcome: "approved", produced: {} });
          const reportedFrame = await client.nextOfType("result");
          client.send({ id: "t3", type: "test.read", run });
          const { status, ending, visits } = (await client.nextOfType("result")).result as TestRunState;

          expect({
            reported: reportedFrame.result,
            read: { status, ending, visits: visits.map(({ id, report }) => [id, report?.outcome ?? null]) },
          }).toEqual({
            reported: { reported: "002-review-1" },
            read: { status: "settled", ending: { outcome: "finished" }, visits: [["001-write-1", "success"], ["002-review-1", "approved"]] },
          });
        },
        REVIEW_LOOP_COLLECTION,
      );
    },
    10_000,
  );
});

describe("test.cancel", () => {
  it(
    "answers test.cancel with the run, which settles as cancelled with 001-write-1 failed while write was running",
    async () => {
      await withFakeClaude(
        SLEEPS_THEN_WRITES,
        async (client, folder) => {
          mkdirSync(folder);
          client.send({ id: "t1", type: "test.start", line: "review-loop", workspace: folder, entered: { topic: "tides" }, permission: "acceptEdits" });
          const { run } = (await client.nextOfType("result")).result as { run: string };
          await client.nextOfType("run.output");

          client.send({ id: "t2", type: "test.cancel", run });
          const { ending, visits } = (await changedFrame(client, "settled")).state;
          const cancelledFrame = await client.nextOfType("result");

          expect({ cancelled: cancelledFrame.result, settled: { ending, visits: visits.map(({ id, report }) => [id, report]) } }).toEqual({
            cancelled: { cancelled: run },
            settled: { ending: { outcome: "cancelled" }, visits: [["001-write-1", { outcome: "failed", error: "the agent run was cancelled" }]] },
          });
        },
        REVIEW_LOOP_COLLECTION,
      );
    },
    10_000,
  );
});

describe("test.preview", () => {
  const definitions = ["review-loop/agents/draft-writer.md", "review-loop/assembly-line.yaml"];
  const topicAsked = [{ name: "topic", kind: "value" }];

  it.each([
    {
      summary: "topic missing and no blockers",
      files: REVIEW_LOOP_COLLECTION,
      entered: {},
      expected: { asked: topicAsked, missing: ["topic"], blockers: [], startItems: {}, definitions },
    },
    {
      summary: "the reviewer@abc123 pin as its blocker and topic tides as its start item",
      files: PINNED_REVIEWER_COLLECTION,
      entered: { topic: "tides" },
      expected: {
        asked: topicAsked,
        missing: [],
        blockers: ["node review pins station reviewer@abc123, and a local test run only has the station its file defines: remove the pin to test it"],
        startItems: { topic: { kind: "value", ref: "tides", by: "start" } },
        definitions,
      },
    },
  ])("answers test.preview of review-loop with $summary", async ({ files, entered, expected }) => {
    const dir = collectionOnDisk(files);

    try {
      const { context } = contextOver(dir, undefined);

      expect(await answerFrame(JSON.stringify({ id: "p1", type: "test.preview", line: "review-loop", entered }), context)).toEqual({
        id: "p1",
        type: "result",
        result: expected,
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("folder.open", () => {
  it.each([
    { label: "/etc", path: () => "/etc" },
    { label: "a path climbing out of the run folder", path: (workspace: string) => `${join(workspace, RUN_FOLDER)}/visits/../../outside` },
    { label: "a sibling whose name starts with the run folder's", path: (workspace: string) => `${join(workspace, RUN_FOLDER)}-evil` },
  ])(
    "refuses folder.open of $label, which is not inside a test run's folder, and opens nothing",
    async ({ path: pathIn }) => {
      await withRegisteredReviewLoop(async ({ context, workspace, opened }) => {
        const path = pathIn(workspace);

        expect({ answer: await answerFrame(JSON.stringify({ id: "o1", type: "folder.open", path }), context), opened }).toEqual({
          answer: { id: "o1", type: "refused", reason: `${path} is not inside a test run's folder` },
          opened: [],
        });
      });
    },
    10_000,
  );

  it.each([
    {
      label: "the draft file 001-write-1 wrote",
      path: (runFolder: string) => join(runFolder, "visits", "001-write-1", "outputs", "draft.md"),
      reason: (path: string) => `${path} is not a folder`,
    },
    {
      label: "a link in 001-write-1's work folder pointing outside the run",
      path: (runFolder: string, workspace: string) => {
        const link = join(runFolder, "visits", "001-write-1", "work", "outside-link");

        symlinkSync(dirname(workspace), link);

        return link;
      },
      reason: (path: string) => `${path} is not inside a test run's folder`,
    },
  ])(
    "refuses folder.open of $label and opens nothing",
    async ({ path: pathIn, reason }) => {
      await withRegisteredReviewLoop(async ({ context, workspace, opened }) => {
        const path = pathIn(join(workspace, RUN_FOLDER), workspace);

        expect({ answer: await answerFrame(JSON.stringify({ id: "o1", type: "folder.open", path }), context), opened }).toEqual({
          answer: { id: "o1", type: "refused", reason: reason(path) },
          opened: [],
        });
      });
    },
    10_000,
  );

  it.each([
    { label: "the run folder", path: (runFolder: string) => runFolder },
    { label: "visit 002-review-1's folder", path: (runFolder: string) => join(runFolder, "visits", "002-review-1") },
  ])(
    "opens $label of review-loop on the desktop",
    async ({ path: pathIn }) => {
      await withRegisteredReviewLoop(async ({ context, workspace, opened }) => {
        const path = pathIn(join(workspace, RUN_FOLDER));

        expect({ answer: await answerFrame(JSON.stringify({ id: "o1", type: "folder.open", path }), context), opened }).toEqual({
          answer: { id: "o1", type: "result", result: { opened: path } },
          opened: [path],
        });
      });
    },
    10_000,
  );
});

describe("folder.list", () => {
  it.each([
    {
      label: "a relative path",
      path: () => "notes",
      reason: () => 'the folder to list must be an absolute path, and "notes" is not',
    },
    {
      label: "an absolute path that does not exist",
      path: (scratchFolder: string) => join(scratchFolder, "missing"),
      reason: (path: string) => `${path} is not a folder on disk`,
    },
    {
      label: "an absolute path to a file",
      path: (scratchFolder: string) => {
        const file = join(scratchFolder, "notes.txt");

        writeFileSync(file, "tides");

        return file;
      },
      reason: (path: string) => `${path} is not a folder on disk`,
    },
  ])("refuses folder.list of $label with its refusal", async ({ path: pathIn, reason }) => {
    await withScratchFolder(async (scratchFolder) => {
      const path = pathIn(scratchFolder);

      expect(await answerFrame(JSON.stringify({ id: "l1", type: "folder.list", path }), IDLE_CONTEXT)).toEqual({
        id: "l1",
        type: "refused",
        reason: reason(path),
      });
    });
  });

  it("lists folders alpha, mango, zebra and files .hidden, notes.md, plan.md by name, sorted, with the scratch folder's parent", async () => {
    await withScratchFolder(async (scratchFolder) => {
      ["mango", "zebra", "alpha"].forEach((folder) => mkdirSync(join(scratchFolder, folder)));
      ["notes.md", "plan.md", ".hidden"].forEach((file) => writeFileSync(join(scratchFolder, file), "tides"));

      expect(await answerFrame(JSON.stringify({ id: "l1", type: "folder.list", path: scratchFolder }), IDLE_CONTEXT)).toEqual({
        id: "l1",
        type: "result",
        result: { path: scratchFolder, parent: dirname(scratchFolder), folders: ["alpha", "mango", "zebra"], files: [".hidden", "notes.md", "plan.md"] },
      });
    });
  });

  it("lists the filesystem root / with no parent", async () => {
    expect(await answerFrame(JSON.stringify({ id: "l1", type: "folder.list", path: "/" }), IDLE_CONTEXT)).toMatchObject({
      id: "l1",
      type: "result",
      result: { path: "/", parent: null },
    });
  });
});

describe("test.event", () => {
  it(
    "answers test.event review.answered with 002-review-1, after which review-loop is settled",
    async () => {
      await withRegisteredReviewLoop(async ({ context }, session) => {
        const answer = await answerFrame(
          JSON.stringify({ id: "e1", type: "test.event", run: session.id, event: "review.answered", payload: { decision: "approved" } }),
          context,
        );
        const { status } = session.state();

        expect({ answer, status }).toEqual({ answer: { id: "e1", type: "result", result: { answered: ["002-review-1"] } }, status: "settled" });
      }, EVENT_REVIEW_COLLECTION);
    },
    10_000,
  );
});

describe("a test run the studio does not have", () => {
  it.each([
    { id: "q1", type: "test.report", run: "no-such-run", visit: "002-review-1", outcome: "approved", produced: {} },
    { id: "q1", type: "test.cancel", run: "no-such-run" },
    { id: "q1", type: "test.read", run: "no-such-run" },
    { id: "q1", type: "test.event", run: "no-such-run", event: "review.answered", payload: { decision: "approved" } },
  ])("refuses $type for run no-such-run with 'there is no test run no-such-run'", async (request) => {
    expect(await answerFrame(JSON.stringify(request), IDLE_CONTEXT)).toEqual({ id: "q1", type: "refused", reason: "there is no test run no-such-run" });
  });
});

async function withScratchFolder(body: (scratchFolder: string) => Promise<void>) {
  const scratchFolder = mkdtempSync(join(tmpdir(), "folder-list-"));

  try {
    await body(scratchFolder);
  } finally {
    rmSync(scratchFolder, { recursive: true, force: true });
  }
}

async function startedReviewLoop(client: Client, folder: string) {
  mkdirSync(folder);
  client.send({ id: "t1", type: "test.start", line: "review-loop", workspace: folder, entered: { topic: "tides" }, permission: "acceptEdits" });
  const started = await client.nextOfType("result");

  return { started, changed: await changedFrame(client, "waiting") };
}

async function changedFrame(client: Client, status: TestRunState["status"]) {
  let changed = await client.nextOfType("test.changed");

  while (changed.state.status !== status) changed = await client.nextOfType("test.changed");

  return changed;
}

async function withRegisteredReviewLoop(
  body: (setup: TestRunSetup, session: TestRunSession) => Promise<void>,
  files: Parameters<typeof withTestRunSetup>[2] = REVIEW_LOOP_COLLECTION,
) {
  await withTestRunSetup(WRITES_DRAFT, async (setup) => {
    const { testRuns } = setup.context;
    const session = await startReviewLoopOnTides(setup);

    testRuns.set(session.id, session);
    await session.idle();
    await body(setup, session);
  }, files);
}
