import { beforeAll, describe, expect, it } from "vitest";
import { defineStation, type Brief, type Handle } from "@floor/station";
import type { LineBody, StationBody } from "@floor/store";
import { SERVICE_TOKEN, outcomeOnceSettled, setupTestServer } from "./test-server.js";

const { server, deps, loop } = setupTestServer();

const CLOSE_ISSUE: StationBody = {
  kind: "service",
  outcomes: ["success", "failed"],
  needs: [
    { name: "issue", kind: "value" },
    { name: "spec", kind: "file" },
  ],
  produces: [
    { name: "closed_by", kind: "value" },
    { name: "summary", kind: "file" },
  ],
};

const OTHER: StationBody = { kind: "service", outcomes: ["success"], needs: [], produces: [] };

let floorUrl = "";

beforeAll(async () => {
  await server().start();
  floorUrl = `http://localhost:${server().info.port}`;
  deps().config.baseUrl = floorUrl;
});

function station(name: string, handle: Handle) {
  return defineStation(name, handle, { floorUrl, token: SERVICE_TOKEN, start: false });
}

async function dispatched(stationName: string): Promise<string> {
  const spec = await deps().blobs.put(Buffer.from("close it kindly"));

  await deps().definitions.put("station", "close-issue", CLOSE_ISSUE);
  await deps().definitions.put("station", "other", OTHER);
  await deps().definitions.put("line", "issues", lineThrough(stationName, { spec: spec.hash }));
  const { run } = await deps().runs.start({ lineId: "issues", repo: "r", startItems: { issue: { kind: "value", ref: "412", by: "start" } } });

  await loop().pass();

  return run.id;
}

function lineThrough(station: string, files: Record<string, string>): LineBody {
  return {
    entry: "work",
    exit: "done",
    args: { issue: { kind: "value" } },
    files,
    nodes: [{ id: "work", station }, { id: "done" }],
    edges: [
      { from: "work", to: "done", on: "success" },
      { from: "work", to: "done", on: "failed" },
    ],
  };
}

async function worked(handle: Handle) {
  const runId = await dispatched("close-issue");
  const taken = await station("close-issue", handle).once();

  await loop().pass();
  const [visit] = await deps().runs.visits(runId);

  return { runId, taken, visit: visit!, run: await deps().runs.get(runId), bag: await deps().runs.bag(runId) };
}

const succeed: Handle = async () => ({ outcome: "success" });

describe("defineStation, against a running floor", () => {
  it("hands the function the visit's brief", async () => {
    const seen: Brief[] = [];

    await worked(async (brief) => {
      seen.push(brief);

      return { outcome: "success" };
    });

    expect(seen).toMatchObject([{ iteration: 1, needs: { issue: "412", spec: expect.stringContaining("/blobs/sha256-") } }]);
  });

  it("settles the run on the outcome the function returns", async () => {
    const { run } = await worked(succeed);

    expect(run!.outcome).toBe("success");
  });

  it("puts a value the function returns into the bag", async () => {
    const { bag, visit } = await worked(async () => ({ outcome: "success", produced: { closed_by: "bender" } }));

    expect(bag.closed_by).toEqual({ kind: "value", ref: "bender", by: visit.id });
  });

  it("reads a file need from the floor it talks to, though the brief names the address a pod would use", async () => {
    const read: string[] = [];

    deps().config.baseUrl = "http://host.minikube.internal:1";
    await worked(async (brief, tools) => {
      read.push((await tools.read("spec")).toString());

      return { outcome: "success" };
    });
    deps().config.baseUrl = floorUrl;

    expect(read).toEqual(["close it kindly"]);
  });

  it("reads a file need through its tools", async () => {
    const read: string[] = [];

    await worked(async (brief, tools) => {
      read.push((await tools.read("spec")).toString());

      return { outcome: "success" };
    });

    expect(read).toEqual(["close it kindly"]);
  });

  it("stores a file the function produces, and names it in the bag", async () => {
    const { bag } = await worked(async (brief, tools) => {
      await tools.produce("summary", "closed 412");

      return { outcome: "success" };
    });
    const stored = await deps().blobs.get(bag.summary.ref);

    expect({ kind: bag.summary.kind, bytes: stored!.bytes.toString() }).toEqual({ kind: "file", bytes: "closed 412" });
  });

  it("records a model call the function made, for the floor's costs", async () => {
    const { visit } = await worked(async (brief, tools) => {
      await tools.modelCall({ costUsd: 0.02, model: "claude-haiku-4-5" });

      return { outcome: "success" };
    });
    const call = await deps().records.latest(visit.id, "llm_call");

    expect(call!.body).toEqual({ costUsd: 0.02, model: "claude-haiku-4-5" });
  });

  it("fails the visit when the function throws, with what it threw", async () => {
    const { visit } = await worked(async () => {
      throw new Error("GitHub said no");
    });

    expect(visit.report).toEqual({ outcome: "failed", error: "GitHub said no" });
  });

  it("names itself as the visit's worker", async () => {
    const { visit } = await worked(succeed);

    expect(visit.worker).toBe("station:close-issue");
  });

  it("acks the dispatch it worked", async () => {
    const { runId } = await worked(succeed);
    const runEvents = await deps().events.listByRun(runId);
    const dispatch = runEvents.find((event) => event.name === "station_run.dispatch");

    expect(dispatch!.ackedAt).not.toBeNull();
  });

  it("hears the floor say the visit is over, and acks that too", async () => {
    const { runId } = await worked(succeed);

    await station("close-issue", succeed).once();
    const runEvents = await deps().events.listByRun(runId);
    const abort = runEvents.find((event) => event.name === "station_run.abort");

    expect(abort!.ackedAt).not.toBeNull();
  });

  it("takes nothing that is another station's", async () => {
    await dispatched("other");

    expect(await station("close-issue", succeed).once()).toBe(0);
  });

  it("refuses to read a need the visit was not given as a file", async () => {
    const { visit } = await worked(async (brief, tools) => {
      await tools.read("issue");

      return { outcome: "success" };
    });

    expect(visit.report?.error).toBe('"issue" is not a file this visit was given');
  });
});

describe("defineStation, left to run", () => {
  const POLL_MS = 20;

  it("works a visit with nobody calling once, beside a floor running its own loop", async () => {
    const running = defineStation("close-issue", succeed, { floorUrl, token: SERVICE_TOKEN, idleMs: POLL_MS });

    loop().start();
    const outcome = await outcomeOnceSettled(deps(), await dispatched("close-issue"));

    await running.stop();
    await loop().stop();

    expect(outcome).toBe("success");
  });
});
