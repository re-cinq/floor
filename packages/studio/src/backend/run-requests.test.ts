import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ServerFrame } from "../protocol.js";
import { lineYaml, WORKER_COLLECTION } from "./collection-view.fixtures.js";
import { type Client, cancelledAfterFirstOutput, closeStartedStudios, collectionOnDisk, connectedTo, connectedToWorkerCollection, EXTRA_TEXT, fakeClaudeScratch, framesUntilRunEnded, openClient, readAnswerAfterRestart, runIdOf, sendWorkRunStart, startedStudio, startWorkRun, withFakeClaude } from "./studio.fixtures.js";

afterEach(closeStartedStudios);

const TWO_LINE_CLAUDE = `#!/bin/sh\necho '{"type":"system"}'\necho '{"type":"result","result":"done"}'\n`;
const READ_RESULT = {
  type: "result",
  result: {
    lines: [
      { stream: "stdout", text: '{"type":"system"}' },
      { stream: "stdout", text: '{"type":"result","result":"done"}' },
    ],
    ended: { exitCode: 0 },
  },
};

async function endedRun(client: Client, folder: string): Promise<string> {
  const run = await startWorkRun(client, folder);

  await client.nextOfType("run.ended");

  return run;
}

async function runEndedAfterClaudePrints(resultLine: object): Promise<ServerFrame | undefined> {
  const script = `#!/bin/sh\nprintf '%s\\n' '${JSON.stringify(resultLine)}'\n`;

  let ended: ServerFrame | undefined;

  await withFakeClaude(script, async (client, folder) => {
    await startWorkRun(client, folder);
    ended = await client.nextOfType("run.ended");
  });

  return ended;
}

describe("startStudio run requests", () => {
  it("answers run.preview with the prompt Work ENG-1. and no blockers for flow/work with ticket ENG-1", async () => {
    const { client } = await connectedToWorkerCollection();

    await client.next();
    client.send({ id: "p1", type: "run.preview", line: "flow", node: "work", fixture: { ticket: "ENG-1" }, folder: "/tmp/run-1", permission: "acceptEdits" });
    const answer = await client.next();

    expect(answer).toMatchObject({ type: "result", result: { prompt: "Work ENG-1.", blockers: [] } });
  });

  it("answers run.preview with the prompt Work ENG-1. joined to the extra text, for flow/work extended by worker.extra.md", async () => {
    const { client } = await connectedTo([...WORKER_COLLECTION, { path: "flow/agents/worker.extra.md", text: EXTRA_TEXT }]);

    await client.next();
    client.send({ id: "p3", type: "run.preview", line: "flow", node: "work", fixture: { ticket: "ENG-1" }, folder: "/tmp/run-1", permission: "acceptEdits" });
    const answer = await client.next();

    expect(answer).toMatchObject({ type: "result", result: { prompt: "Work ENG-1.\n\n\nAlso check the tests." } });
  });

  it('answers run.preview with the blocker "plan": /no/such/plan.md is not on disk, for file need plan fixtured to /no/such/plan.md', async () => {
    const fileNeedLine = lineYaml("flow", "worker").replace("name: ticket\n        kind: value", "name: plan\n        kind: file\n        path: plan.md");
    const { client } = await connectedTo([{ path: "flow/assembly-line.yaml", text: fileNeedLine }, WORKER_COLLECTION[1]]);

    await client.next();
    client.send({ id: "p2", type: "run.preview", line: "flow", node: "work", fixture: { plan: "/no/such/plan.md" }, folder: "/tmp/run-1", permission: "acceptEdits" });
    const answer = await client.next();

    expect(answer).toMatchObject({ type: "result", result: { blockers: ['"plan": /no/such/plan.md is not on disk'] } });
  });

  it("answers run.start with the run id, then claude's two stdout lines and exit code 0 for flow/work with ticket ENG-1", async () => {
    await withFakeClaude(TWO_LINE_CLAUDE, async (client, folder) => {
      sendWorkRunStart(client, folder);
      const frames = await framesUntilRunEnded(client);
      const run = runIdOf(frames[0]);

      expect(frames).toMatchObject([
        { type: "result", id: "s1", result: { run } },
        { type: "run.output", run, line: { stream: "stdout", text: '{"type":"system"}' } },
        { type: "run.output", run, line: { stream: "stdout", text: '{"type":"result","result":"done"}' } },
        { type: "run.ended", run, exitCode: 0 },
      ]);
    });
  });

  it('refuses run.start with "plan": /no/such/plan.md is not on disk, creating no folder and saving no run', async () => {
    const fileNeedLine = lineYaml("flow", "worker").replace("name: ticket\n        kind: value", "name: plan\n        kind: file\n        path: plan.md");
    const dir = collectionOnDisk([{ path: "flow/assembly-line.yaml", text: fileNeedLine }, WORKER_COLLECTION[1]]);
    const scratch = mkdtempSync(join(tmpdir(), "floor-run-refused-"));
    const bin = join(scratch, "bin");
    const folder = join(scratch, "folder");
    const runsDir = join(dir, ".floor-studio", "runs");

    try {
      mkdirSync(bin);
      writeFileSync(join(bin, "claude"), `#!/bin/sh\ntouch "$PWD/claude-ran"\n`, { mode: 0o755 });
      const studio = await startedStudio({ dir, runEnv: { PATH: `${bin}:${process.env.PATH}` } });
      const client = await openClient(studio.url, { token: studio.token });

      await client.next();
      client.send({ id: "s1", type: "run.start", line: "flow", node: "work", fixture: { plan: "/no/such/plan.md" }, folder, permission: "acceptEdits" });
      const frame = await client.next();

      expect({ frame, folderCreated: existsSync(folder), runsSaved: existsSync(runsDir) ? readdirSync(runsDir) : [] }).toEqual({
        frame: { id: "s1", type: "refused", reason: '"plan": /no/such/plan.md is not on disk' },
        folderCreated: false,
        runsSaved: [],
      });
    } finally {
      rmSync(scratch, { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("answers run.read after 0 with both stdout lines and exit code 0 once the run has ended", async () => {
    await withFakeClaude(TWO_LINE_CLAUDE, async (client, folder) => {
      const run = await endedRun(client, folder);

      client.send({ id: "r1", type: "run.read", run, after: 0 });

      expect(await client.nextOfType("result")).toMatchObject({ ...READ_RESULT, id: "r1" });
    });
  });

  it("answers run.read after 0 with both stdout lines and exit code 0 from a studio restarted after the run ended", async () => {
    const answer = await readAnswerAfterRestart(TWO_LINE_CLAUDE);

    expect(answer).toMatchObject(READ_RESULT);
  });

  it("answers run.read with outcome success, cost $0.0421 and 8400 ms from a studio restarted after the run ended", async () => {
    const resultLine = { type: "result", result: "Done.\nLORE_NODE_RESULT: success", total_cost_usd: 0.0421, duration_ms: 8400 };

    const answer = await readAnswerAfterRestart(`#!/bin/sh\nprintf '%s\\n' '${JSON.stringify(resultLine)}'\n`);

    expect(answer).toMatchObject({ result: { ended: { exitCode: 0, outcome: "success", costUsd: 0.0421, durationMs: 8400 } } });
  });

  it.each([
    { type: "run.cancel", request: { run: "nope" }, reason: "no running run nope" },
    { type: "run.read", request: { run: "nope", after: 0 }, reason: "no run nope" },
  ])("refuses $type of run nope with $reason", async ({ type, request, reason }) => {
    const { client } = await connectedToWorkerCollection();

    await client.next();
    client.send({ id: "u1", type, ...request });

    expect(await client.next()).toEqual({ id: "u1", type: "refused", reason });
  });

  it("refuses run.read of run ../outside although .floor-studio/outside.json holds a transcript", async () => {
    const { dir, client } = await connectedToWorkerCollection();

    try {
      mkdirSync(join(dir, ".floor-studio"), { recursive: true });
      writeFileSync(join(dir, ".floor-studio", "outside.json"), JSON.stringify({ lines: [{ stream: "stdout", text: "leaked" }], ended: { exitCode: 0 } }));

      await client.next();
      client.send({ id: "u1", type: "run.read", run: "../outside", after: 0 });

      expect(await client.next()).toEqual({ id: "u1", type: "refused", reason: "no run ../outside" });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("ends the run with exit code null when run.cancel stops a claude sleeping 30 seconds", async () => {
    await withFakeClaude(`#!/bin/sh\necho started\nsleep 30\n`, async (client, folder) => {
      const { run, ended } = await cancelledAfterFirstOutput(client, folder);

      expect(ended).toMatchObject({ type: "run.ended", run, exitCode: null });
    });
  }, 10_000);

  it("ends a run cancelled after claude printed a $0.0421 success result with exit code null and nothing else", async () => {
    const resultLine = JSON.stringify({ type: "result", result: "Done.\nLORE_NODE_RESULT: success", total_cost_usd: 0.0421, duration_ms: 8400 });

    await withFakeClaude(`#!/bin/sh\nprintf '%s\\n' '${resultLine}'\nsleep 30\n`, async (client, folder) => {
      const { run, ended } = await cancelledAfterFirstOutput(client, folder);

      expect(ended).toEqual({ type: "run.ended", run, exitCode: null });
    });
  }, 10_000);

  it("ends the run with outcome success, the work to done edge and no produces when claude's result ends with LORE_NODE_RESULT: success", async () => {
    const ended = await runEndedAfterClaudePrints({ type: "result", result: "Done.\nLORE_NODE_RESULT: success" });

    expect(ended).toMatchObject({ type: "run.ended", exitCode: 0, outcome: "success", edge: { from: "work", to: "done" }, produced: [] });
  });

  it("ends the run with cost $0.0421 and duration 8400 ms when claude's result line states them", async () => {
    const ended = await runEndedAfterClaudePrints({ type: "result", result: "Done.\nLORE_NODE_RESULT: success", total_cost_usd: 0.0421, duration_ms: 8400 });

    expect(ended).toMatchObject({ exitCode: 0, outcome: "success", costUsd: 0.0421, durationMs: 8400 });
  });

  it("ends the run with outcome failed when worker requires a result and claude's result 'All done.' carries no marker", async () => {
    const requiringLine = lineYaml("flow", "worker").replace("    kind: agent\n", "    kind: agent\n    result_required: true\n");
    const dir = collectionOnDisk([{ path: "flow/assembly-line.yaml", text: requiringLine }, WORKER_COLLECTION[1]]);
    const resultLine = JSON.stringify({ type: "result", result: "All done." });
    const { scratch, runEnv } = fakeClaudeScratch("floor-run-required-", `#!/bin/sh\nprintf '%s\\n' '${resultLine}'\n`);

    try {
      const studio = await startedStudio({ dir, runEnv });
      const client = await openClient(studio.url, { token: studio.token });

      await client.next();
      await startWorkRun(client, join(scratch, "folder"));

      expect(await client.nextOfType("run.ended")).toMatchObject({ exitCode: 0, outcome: "failed" });
    } finally {
      rmSync(scratch, { recursive: true, force: true });
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
