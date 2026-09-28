import { describe, expect, it } from "vitest";
import { outcomeOnceSettled, setupTestServer } from "../test-server.js";
import { MARKER_LINE } from "./lines.fixtures.js";
import { FloorLoop } from "./loop.js";

const { deps, loop } = setupTestServer();

const CONTENDED_KEY = 0x636f6e74n;
const POLL_MS = 20;

async function startMarkers(): Promise<string> {
  await deps().definitions.put("line", "markers", MARKER_LINE);
  const { run } = await deps().runs.start({ lineId: "markers", repo: "r", startItems: {} });

  return run.id;
}

function contender(calls: string[]): FloorLoop {
  return new FloorLoop({
    pool: deps().pool,
    dispatcher: { tick: async () => calls.push("tick") && 0 },
    sweeper: { sweep: async () => calls.push("sweep") },
    now: deps().now,
    leaseKey: CONTENDED_KEY,
    pollMs: POLL_MS,
    sweepMs: 0,
  });
}

describe("FloorLoop.pass", () => {
  it("walks a started run to its end in one pass", async () => {
    const runId = await startMarkers();

    await loop().pass();
    const run = await deps().runs.get(runId);

    expect(run!.outcome).toBe("success");
  });

  it("does no work while another instance holds the lease", async () => {
    const holderCalls: string[] = [];
    const idleCalls: string[] = [];
    const holder = contender(holderCalls);

    await holder.pass();
    await contender(idleCalls).pass();
    await holder.stop();

    expect({ holderCalls, idleCalls }).toEqual({ holderCalls: ["tick", "sweep"], idleCalls: [] });
  });

  it("takes over once the holder stops", async () => {
    const calls: string[] = [];
    const holder = contender([]);
    const successor = contender(calls);

    await holder.pass();
    await holder.stop();
    await successor.pass();
    await successor.stop();

    expect(calls).toEqual(["tick", "sweep"]);
  });
});

describe("FloorLoop.start", () => {
  it("settles a run started while it is running, with nobody calling pass", async () => {
    loop().start();
    const runId = await startMarkers();

    const outcome = await outcomeOnceSettled(deps(), runId);

    await loop().stop();

    expect(outcome).toBe("success");
  });

  it("keeps going after a pass that throws", async () => {
    const calls: string[] = [];
    const flaky = new FloorLoop({
      pool: deps().pool,
      dispatcher: { tick: async () => (calls.push("tick") === 1 ? Promise.reject(new Error("database blinked")) : 0) },
      sweeper: { sweep: async () => 0 },
      now: deps().now,
      leaseKey: CONTENDED_KEY,
      pollMs: 1,
      sweepMs: 0,
    });

    flaky.start();
    await new Promise((resolve) => setTimeout(resolve, 200));
    await flaky.stop();

    expect(calls.length).toBeGreaterThan(1);
  });
});
