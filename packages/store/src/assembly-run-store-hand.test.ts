import { describe, expect, it } from "vitest";
import { setupStoreFixture } from "./assembly-run-store.fixtures.js";
import type { LineBody, StationBody } from "./types.js";

const { store, definitions, events } = setupStoreFixture();

const PLAN_LINE: LineBody = {
  entry: "author",
  exit: "done",
  args: {},
  nodes: [
    { id: "author", station: "plan-author" },
    { id: "validate", station: "plan-validate", start: "manual.plan.validate" },
    { id: "done" },
  ],
  edges: [
    { from: "author", to: "done", on: "success" },
    { from: "validate", to: "author", on: "always" },
  ],
};

const AUTHOR_STATION: StationBody = { kind: "human", outcomes: ["success"], needs: [], produces: [], route: "/plans" };
const VALIDATE_STATION: StationBody = { kind: "service", outcomes: ["success"], needs: [], produces: [] };

async function runWaitingOnAuthor(): Promise<string> {
  await definitions().put("line", "plan", PLAN_LINE);
  await definitions().put("station", "plan-author", AUTHOR_STATION);
  await definitions().put("station", "plan-validate", VALIDATE_STATION);
  const { run } = await store().start({ lineId: "plan", repo: "r", startItems: {} });

  await store().openVisit(run.id, "author", 1);

  return run.id;
}

async function validatedByHand() {
  const runId = await runWaitingOnAuthor();
  const opened = await store().openVisitByHand(runId, "validate", "ana");
  const visits = await store().visits(runId);
  const run = await store().get(runId);

  return { runId, opened, visits, run };
}

async function eventNames(runId: string): Promise<string[]> {
  const runEvents = await events().listByRun(runId);

  return runEvents.map((event) => event.name);
}

describe("AssemblyRunStore.start", () => {
  it("posts the entry node's start event at iteration 1", async () => {
    const runId = await runWaitingOnAuthor();
    const runEvents = await events().listByRun(runId);
    const entryStart = runEvents.find((event) => event.name === "node.author.start");

    expect(entryStart?.payload).toEqual({ runId, nodeId: "author", iteration: 1 });
  });
});

describe("AssemblyRunStore.openVisitByHand", () => {
  it("closes the run's open human visit as cancelled", async () => {
    const { visits } = await validatedByHand();

    expect(visits.map((visit) => visit.report?.outcome ?? null)).toEqual(["cancelled", null]);
  });

  it("records who asked on the visit it opens", async () => {
    const { opened } = await validatedByHand();

    expect(opened.visit).toMatchObject({ nodeId: "validate", iteration: 1, requestedBy: "ana" });
  });

  it("leaves the run open", async () => {
    const { run } = await validatedByHand();

    expect(run!.finishedAt).toBeNull();
  });

  it("dispatches a service station under its own name", async () => {
    const { runId } = await validatedByHand();
    const runEvents = await events().listByRun(runId);
    const dispatch = runEvents.find((event) => event.name === "station_run.dispatch");

    expect(dispatch?.tags).toEqual(["station:plan-validate"]);
  });

  it("returns the node's already-open visit on a redelivered start", async () => {
    const { runId, opened } = await validatedByHand();

    const again = await store().openVisitByHand(runId, "validate", "ana");

    expect({ id: again.visit.id, created: again.created }).toEqual({ id: opened.visit.id, created: false });
  });

  it("hands back to the human node at its next iteration once the hand-run node reports", async () => {
    const { runId, opened } = await validatedByHand();

    await store().report(opened.visit.id, { outcome: "success" });
    const runEvents = await events().listByRun(runId);

    expect(runEvents.at(-1)).toMatchObject({ name: "node.author.start", payload: { nodeId: "author", iteration: 2 } });
  });
});

describe("AssemblyRunStore.nodeStartedBy", () => {
  it("finds a node by the start name its line gives it", async () => {
    const runId = await runWaitingOnAuthor();

    expect(await store().nodeStartedBy(runId, "manual.plan.validate")).toBe("validate");
  });

  it("finds a node by the default start name", async () => {
    const runId = await runWaitingOnAuthor();

    expect(await store().nodeStartedBy(runId, "node.author.start")).toBe("author");
  });

  it("returns null for an event that starts no node in this line", async () => {
    const runId = await runWaitingOnAuthor();

    expect(await store().nodeStartedBy(runId, "github.pull_request.closed")).toBeNull();
  });
});

describe("AssemblyRunStore.fail", () => {
  it("settles the run as error with the reason", async () => {
    const runId = await runWaitingOnAuthor();

    const run = await store().fail(runId, "node can never open");

    expect(run).toMatchObject({ outcome: "error", reason: "node can never open" });
  });

  it("posts internal.run.settled", async () => {
    const runId = await runWaitingOnAuthor();

    await store().fail(runId, "node can never open");

    expect(await eventNames(runId)).toContain("internal.run.settled");
  });
});

describe("AssemblyRunStore.cancel", () => {
  it("posts internal.run.settled", async () => {
    const runId = await runWaitingOnAuthor();

    await store().cancel(runId, "not needed");

    expect(await eventNames(runId)).toContain("internal.run.settled");
  });
});
