import { describe, expect, it } from "vitest";
import type { LineBody, StationBody } from "@floor/store";
import { setupTestServer } from "../test-server.js";
import { MARKER_LINE } from "./lines.fixtures.js";
import { Dispatcher } from "./dispatcher.js";

const { deps } = setupTestServer();

const MISSING_RUN = "0b0e7d3c-6f1a-4a52-9d3e-2f6f1c1e9a01";
const MISSING_VISIT = "5c2a9b1e-3d4f-4c6a-8b7e-9f0a1b2c3d4e";
const MAX_TICKS = 20;

const WORK_LINE: LineBody = {
  entry: "work",
  exit: "done",
  args: {},
  nodes: [
    { id: "work", station: "work" },
    { id: "check", station: "check", start: "manual.work.check" },
    { id: "done" },
  ],
  edges: [
    { from: "work", to: "done", on: "success" },
    { from: "check", to: "work", on: "always" },
  ],
};

const WORK_STATION: StationBody = { kind: "service", outcomes: ["success"], needs: [], produces: [] };
const NEEDY_STATION: StationBody = { ...WORK_STATION, needs: [{ name: "plan", kind: "file" }] };

async function tickUntilIdle(): Promise<void> {
  for (let tick = 0; tick < MAX_TICKS; tick++) {
    if ((await dispatcher().tick()) === 0) return;
  }
}

function dispatcher(): Dispatcher {
  return new Dispatcher({ runs: deps().runs, events: deps().events, outside: deps().outside, claimedBy: "floor-test" });
}

async function startLine(line: LineBody, workStation: StationBody = WORK_STATION): Promise<string> {
  await deps().definitions.put("line", "line", line);
  await deps().definitions.put("station", "work", workStation);
  await deps().definitions.put("station", "check", WORK_STATION);
  const { run } = await deps().runs.start({ lineId: "line", repo: "r", startItems: {} });

  return run.id;
}

async function workOpened() {
  const runId = await startLine(WORK_LINE);

  await tickUntilIdle();
  const visits = await deps().runs.visits(runId);
  const runEvents = await deps().events.listByRun(runId);

  return { runId, visits, runEvents };
}

async function postedThenHandled(name: string, payload: Record<string, unknown>) {
  const posted = await deps().events.enqueue({ name, payload });

  await tickUntilIdle();

  return (await deps().events.get(posted.id))!;
}

describe("Dispatcher: the walk", () => {
  it("walks a line of markers to its exit with nobody reporting", async () => {
    const runId = await startLine(MARKER_LINE);

    await tickUntilIdle();
    const run = await deps().runs.get(runId);

    expect(run!.outcome).toBe("success");
  });

  it("opens the entry node's visit from the run's start event", async () => {
    const { visits } = await workOpened();

    expect(visits.map((visit) => `${visit.nodeId}#${visit.iteration}`)).toEqual(["work#1"]);
  });

  it("acks the events it handles", async () => {
    const { runEvents } = await workOpened();
    const entryStart = runEvents.find((event) => event.name === "node.work.start");

    expect(entryStart!.ackedAt).not.toBeNull();
  });

  it("leaves station_run.dispatch for a worker to claim", async () => {
    const { runEvents } = await workOpened();
    const dispatch = runEvents.find((event) => event.name === "station_run.dispatch");

    expect(dispatch).toMatchObject({ claimedAt: null, tags: ["station:work"] });
  });

  it("settles the run once the station's report arrives as an event", async () => {
    const { runId, visits } = await workOpened();

    await postedThenHandled("station_run.reported", { visitId: visits[0]!.id, report: { outcome: "success" } });
    const run = await deps().runs.get(runId);

    expect(run!.outcome).toBe("success");
  });
});

describe("Dispatcher: a start by hand", () => {
  async function checkedByHand() {
    const { runId } = await workOpened();
    const handled = await postedThenHandled("manual.work.check", { runId, requestedBy: "ana" });
    const visits = await deps().runs.visits(runId);

    return { handled, visits };
  }

  it("opens the node the event names in that run's line", async () => {
    const { visits } = await checkedByHand();

    expect(visits.at(-1)).toMatchObject({ nodeId: "check", iteration: 1, requestedBy: "ana" });
  });

  it("acks the start event", async () => {
    const { handled } = await checkedByHand();

    expect(handled.ackedAt).not.toBeNull();
  });
});

describe("Dispatcher: events it cannot act on", () => {
  it("fails the run when its node can never open", async () => {
    const runId = await startLine(WORK_LINE, NEEDY_STATION);

    await tickUntilIdle();
    const run = await deps().runs.get(runId);

    expect(run).toMatchObject({ outcome: "error", reason: expect.stringContaining("missing required need") });
  });

  it("dead-letters the start event of a node that can never open", async () => {
    const runId = await startLine(WORK_LINE, NEEDY_STATION);

    await tickUntilIdle();
    const runEvents = await deps().events.listByRun(runId);
    const entryStart = runEvents.find((event) => event.name === "node.work.start");

    expect(entryStart!.deadAt).not.toBeNull();
  });

  it("dead-letters an event for a run that does not exist", async () => {
    const handled = await postedThenHandled("node.work.start", { runId: MISSING_RUN, iteration: 1 });

    expect(handled.deadAt).not.toBeNull();
  });

  it("dead-letters a report for a visit that does not exist", async () => {
    const handled = await postedThenHandled("station_run.reported", { visitId: MISSING_VISIT, report: { outcome: "success" } });

    expect(handled.deadAt).not.toBeNull();
  });

  it("dead-letters a report with no outcome, naming what is wrong", async () => {
    const handled = await postedThenHandled("station_run.reported", { visitId: MISSING_VISIT, report: {} });

    expect(handled.lastError).toContain("report.outcome");
  });

  it("acks an event that starts no node in the run it names", async () => {
    const { runId } = await workOpened();

    const handled = await postedThenHandled("github.pull_request.closed", { runId });

    expect(handled.ackedAt).not.toBeNull();
  });

  it("dead-letters a start event for a run already ended, leaving its outcome alone", async () => {
    const { runId } = await workOpened();

    await deps().runs.cancel(runId, "not needed");
    await postedThenHandled("manual.work.check", { runId });
    const run = await deps().runs.get(runId);

    expect(run!.outcome).toBe("cancelled");
  });
});

describe("Dispatcher: events from outside", () => {
  const OPENED = "github.pull_request.opened";
  const CLOSED = "github.pull_request.closed";
  const REPO = "github.com/re-cinq/lore";

  const WAITS_FOR_MERGE = { id: "merged", station: "pr-merged", reports: [{ on: CLOSED, when: { merged: true }, outcome: "success" }] };

  const MERGE_LINE: LineBody = {
    entry: "merged",
    exit: "done",
    start: { on: [OPENED], args: { pr_url: "{pull_request_url}" } },
    args: { pr_url: { kind: "value", subject: true } },
    nodes: [WAITS_FOR_MERGE, { id: "done" }],
    edges: [{ from: "merged", to: "done", on: "success" }],
  };

  const NOTIFY_LINE: LineBody = {
    ...MARKER_LINE,
    start: { on: ["internal.run.settled"], args: { settled_run: "{runId}" } },
    args: { settled_run: { kind: "value" } },
  };

  async function pullRequestOpened() {
    await deps().definitions.put("line", "merge", MERGE_LINE);
    await deps().definitions.put("station", "pr-merged", { kind: "human", outcomes: ["success"], needs: [], produces: [] });
    await postedThenHandled(OPENED, { repo: REPO, pull_request_url: "https://pr/412" });

    return deps().runs.list({ lineId: "merge" }, { limit: 10 });
  }

  async function pullRequestMerged() {
    await deps().definitions.put("line", "notify", NOTIFY_LINE);
    await pullRequestOpened();
    await postedThenHandled(CLOSED, { subjectKey: "pr_url:https://pr/412", repo: REPO, merged: true });

    return deps().runs.list({ repo: REPO }, { limit: 10 });
  }

  it("starts the line that declares the event", async () => {
    const runs = await pullRequestOpened();

    expect(runs.items).toMatchObject([{ lineId: "merge", subjectKey: "pr_url:https://pr/412", outcome: null }]);
  });

  it("opens the started run's entry node in the same pass over the queue", async () => {
    const runs = await pullRequestOpened();
    const [merge] = runs.items;
    const visits = await deps().runs.visits(merge!.id);

    expect(visits).toMatchObject([{ nodeId: "merged", report: null }]);
  });

  it("answers the waiting node, found by the run's subject, and the run settles", async () => {
    const runs = await pullRequestMerged();
    const merge = runs.items.find((run) => run.lineId === "merge");

    expect(merge!.outcome).toBe("success");
  });

  it("starts a line on another's settling, and walks it to its end", async () => {
    const runs = await pullRequestMerged();
    const notify = runs.items.find((run) => run.lineId === "notify");

    expect(notify).toMatchObject({ outcome: "success", startItems: { settled_run: { kind: "value" } } });
  });

  it("starts the notify line once, not again on its own settling", async () => {
    const runs = await pullRequestMerged();

    expect(runs.items.filter((run) => run.lineId === "notify")).toHaveLength(1);
  });

  it("acks an event naming a subject no open run holds", async () => {
    const handled = await postedThenHandled(CLOSED, { subjectKey: "pr_url:https://pr/999", repo: REPO, merged: true });

    expect(handled.ackedAt).not.toBeNull();
  });

  it("dead-letters an event whose payload cannot fill a line's start mapping", async () => {
    await deps().definitions.put("line", "merge", MERGE_LINE);

    const handled = await postedThenHandled(OPENED, { repo: REPO });

    expect(handled.lastError).toContain('line "merge"');
  });
});
