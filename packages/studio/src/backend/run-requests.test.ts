import { afterEach, describe, expect, it } from "vitest";
import { lineYaml, WORKER_COLLECTION } from "./collection-view.fixtures.js";
import { type Client, closeStartedStudios, connectedTo, connectedToWorkerCollection, EXTRA_TEXT, framesUntilRunEnded, withFakeClaude } from "./studio.fixtures.js";

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
  client.send({ id: "s1", type: "run.start", line: "flow", node: "work", fixture: { ticket: "ENG-1" }, folder, permission: "acceptEdits" });
  const [started] = await framesUntilRunEnded(client);

  return (started as unknown as { result: { run: string } }).result.run;
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
      client.send({ id: "s1", type: "run.start", line: "flow", node: "work", fixture: { ticket: "ENG-1" }, folder, permission: "acceptEdits" });
      const frames = await framesUntilRunEnded(client);
      const { result } = frames[0] as { result: { run: string } };
      const { run } = result;

      expect(frames).toMatchObject([
        { type: "result", id: "s1", result: { run } },
        { type: "run.output", run, line: { stream: "stdout", text: '{"type":"system"}' } },
        { type: "run.output", run, line: { stream: "stdout", text: '{"type":"result","result":"done"}' } },
        { type: "run.ended", run, exitCode: 0 },
      ]);
    });
  });

  it("answers run.read after 0 with both stdout lines and exit code 0 once the run has ended", async () => {
    await withFakeClaude(TWO_LINE_CLAUDE, async (client, folder) => {
      const run = await endedRun(client, folder);

      client.send({ id: "r1", type: "run.read", run, after: 0 });

      expect(await client.nextOfType("result")).toMatchObject({ ...READ_RESULT, id: "r1" });
    });
  });

  it("answers run.read after 0 with both stdout lines and exit code 0 from a studio restarted after the run ended", async () => {
    await withFakeClaude(TWO_LINE_CLAUDE, async (client, folder, restart) => {
      const run = await endedRun(client, folder);
      const restarted = await restart();

      restarted.send({ id: "r1", type: "run.read", run, after: 0 });

      expect(await restarted.nextOfType("result")).toMatchObject(READ_RESULT);
    });
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

  it("ends the run with exit code null when run.cancel stops a claude sleeping 30 seconds", async () => {
    await withFakeClaude(`#!/bin/sh\necho started\nsleep 30\n`, async (client, folder) => {
      client.send({ id: "s1", type: "run.start", line: "flow", node: "work", fixture: { ticket: "ENG-1" }, folder, permission: "acceptEdits" });
      const { run } = (await client.nextOfType("result") as unknown as { result: { run: string } }).result;

      await client.nextOfType("run.output");
      client.send({ id: "c1", type: "run.cancel", run });

      expect(await client.nextOfType("run.ended")).toMatchObject({ type: "run.ended", run, exitCode: null });
    });
  }, 10_000);

  it("ends the run with outcome success, the work to done edge and no produces when claude's result ends with LORE_NODE_RESULT: success", async () => {
    const resultLine = JSON.stringify({ type: "result", result: "Done.\nLORE_NODE_RESULT: success" });

    await withFakeClaude(`#!/bin/sh\nprintf '%s\\n' '${resultLine}'\n`, async (client, folder) => {
      client.send({ id: "s1", type: "run.start", line: "flow", node: "work", fixture: { ticket: "ENG-1" }, folder, permission: "acceptEdits" });
      const frames = await framesUntilRunEnded(client);

      expect(frames.at(-1)).toMatchObject({ type: "run.ended", exitCode: 0, outcome: "success", edge: { from: "work", to: "done" }, produced: [] });
    });
  });

});
