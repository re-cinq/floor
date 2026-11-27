import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { approveAfter90Seconds, jsonLinesIn, RUN_FOLDER, startReviewLoopOnTides, withTestRunSetup, WRITES_DRAFT } from "./test-run-session.fixtures.js";

describe("timeline", () => {
  it("lists run_started, both visits opened and reported, and run_settled finished 90 seconds later, for review-loop approved at 14:14:00", async () => {
    await withTestRunSetup(WRITES_DRAFT, async (setup) => {
      await approveAfter90Seconds(setup);

      const entries = jsonLinesIn(join(setup.workspace, RUN_FOLDER, "timeline.jsonl"));
      const started = "2026-11-27T14:12:30.000Z";
      const answered = "2026-11-27T14:14:00.000Z";

      expect(entries).toEqual([
        { "at": started, type: "run_started", line: "review-loop" },
        {
          "at": started,
          type: "visit_opened",
          visit: "001-write-1",
          node: "write",
          iteration: 1,
          mode: "local",
        },
        {
          "at": started,
          type: "visit_reported",
          visit: "001-write-1",
          outcome: "success",
        },
        {
          "at": started,
          type: "visit_opened",
          visit: "002-review-1",
          node: "review",
          iteration: 1,
          mode: "simulated",
        },
        {
          "at": answered,
          type: "visit_reported",
          visit: "002-review-1",
          outcome: "approved",
        },
        { "at": answered, type: "run_settled", outcome: "finished" },
      ]);
    });
  }, 10_000);
});

describe("visit records", () => {
  it("records 001-write-1 as local costing 0.0421 for 8400 ms and 002-review-1 as simulated taking 90000 ms, each with its outcome and next node", async () => {
    await withTestRunSetup(WRITES_DRAFT, async (setup) => {
      await approveAfter90Seconds(setup);

      const runFolder = join(setup.workspace, RUN_FOLDER);
      const [writeRecord, reviewRecord] = ["001-write-1", "002-review-1"].map((visitId) => jsonIn(join(runFolder, "visits", visitId, "visit.json")));
      const draft = join(
        runFolder,
        "visits",
        "001-write-1",
        "outputs",
        "draft.md",
      );

      expect([writeRecord, reviewRecord]).toEqual([
        {
          id: "001-write-1",
          node: "write",
          station: "draft-writer",
          iteration: 1,
          mode: "local",
          openedAt: "2026-11-27T14:12:30.000Z",
          reportedAt: "2026-11-27T14:12:30.000Z",
          durationMs: 0,
          agentDurationMs: 8400,
          costUsd: 0.0421,
          outcome: "success",
          produced: { draft },
          next: "review",
        },
        {
          id: "002-review-1",
          node: "review",
          station: "reviewer",
          iteration: 1,
          mode: "simulated",
          openedAt: "2026-11-27T14:12:30.000Z",
          reportedAt: "2026-11-27T14:14:00.000Z",
          durationMs: 90000,
          outcome: "approved",
          next: "done",
        },
      ]);
    });
  }, 10_000);
});

describe("visit inputs", () => {
  it("keeps topic tides as 001-write-1's inputs, the draft as 002-review-1's while it waits, the prompt about tides and the agent's one result line", async () => {
    await withTestRunSetup(WRITES_DRAFT, async (setup) => {
      const session = await startReviewLoopOnTides(setup);

      await session.idle();

      const visits = join(setup.workspace, RUN_FOLDER, "visits");
      const draft = join(visits, "001-write-1", "outputs", "draft.md");

      expect({
        writeInputs: jsonIn(join(visits, "001-write-1", "inputs.json")),
        reviewInputs: jsonIn(join(visits, "002-review-1", "inputs.json")),
        promptFirstLine: readFileSync(join(visits, "001-write-1", "prompt.md"), "utf8").split("\n")[0],
        transcript: jsonLinesIn(join(visits, "001-write-1", "transcript.jsonl")),
      }).toEqual({
        writeInputs: { topic: "tides" },
        reviewInputs: { draft },
        promptFirstLine: `Write a short draft about tides into the file ${join(visits, "001-write-1", "work", "draft.md")}.`,
        transcript: [{ type: "result", result: "Done.\nLORE_NODE_RESULT: success", total_cost_usd: 0.0421, duration_ms: 8400 }],
      });
    });
  }, 10_000);
});

describe("run summary", () => {
  it("summarises review-loop in run.json as settled finished, 2 visits taking 90000 ms and costing $0.0421 in all", async () => {
    await withTestRunSetup(WRITES_DRAFT, async (setup) => {
      await approveAfter90Seconds(setup);

      const summary = jsonIn(join(setup.workspace, RUN_FOLDER, "run.json"));

      expect(summary).toEqual({
        line: "review-loop",
        startedAt: "2026-11-27T14:12:30.000Z",
        startItems: { topic: { kind: "value", ref: "tides", by: "start" } },
        status: "settled",
        ending: { outcome: "finished" },
        totals: {
          run: { visits: 2, durationMs: 90000, costUsd: 0.0421, costUnstated: 0 },
          nodes: [
            { nodeId: "write", visits: 1, durationMs: 0, costUsd: 0.0421, costUnstated: 0 },
            { nodeId: "review", visits: 1, durationMs: 90000, costUsd: 0, costUnstated: 0 },
          ],
        },
      });
    });
  }, 10_000);
});

function jsonIn(path: string): unknown {
  return JSON.parse(readFileSync(path, "utf8"));
}
