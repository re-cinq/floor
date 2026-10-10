import { describe, expect, it } from "vitest";
import type { LineBody, Visit } from "./types.js";
import { RecordsStore, type RecordInput } from "./records.js";
import { FIXED_NOW, REVIEW_LINE, setupStoreFixture, startItems } from "./assembly-run-store.fixtures.js";

const { pool, store, events, seedReviewLine, openEntryVisit, reviewSucceedsIntoRetrospective } = setupStoreFixture();

const FAIL_ROUTED_LINE: LineBody = {
  ...REVIEW_LINE,
  fail: "failed",
  nodes: [...REVIEW_LINE.nodes, { id: "failed" }],
  edges: REVIEW_LINE.edges.map((edge) => (edge.from === "review" && edge.on === "failed" ? { from: "review", to: "failed", on: "failed" } : edge)),
};

describe("AssemblyRunStore.report", () => {
  async function reportSuccessThenVisit(visitId: string, times: number): Promise<Visit | null> {
    for (let attempt = 0; attempt < times; attempt++) {
      await store().report(visitId, { outcome: "success" });
    }

    return store().visit(visitId);
  }

  it("writes the report on the visit", async () => {
    const { visitId } = await openEntryVisit();
    const visit = await reportSuccessThenVisit(visitId, 1);

    expect(visit!.report).toEqual({ outcome: "success" });
  });

  it("is a no-op on an equal replay", async () => {
    const { visitId } = await openEntryVisit();
    const visit = await reportSuccessThenVisit(visitId, 2);

    expect(visit!.report).toEqual({ outcome: "success" });
  });

  it("refuses a different report once the visit is already done", async () => {
    const { visitId } = await openEntryVisit();

    await store().report(visitId, { outcome: "success" });

    await expect(store().report(visitId, { outcome: "failed" })).rejects.toThrow(/already has a different report/);
  });

  it("carries when the visit opened and no finish while it is open", async () => {
    const { visitId } = await openEntryVisit();
    const visit = await store().visit(visitId);

    expect({ opened: visit!.openedAt instanceof Date, finished: visit!.finishedAt }).toEqual({ opened: true, finished: null });
  });

  it("carries the fixed clock as finishedAt once the visit reported", async () => {
    const { visitId } = await openEntryVisit();
    const visit = await reportSuccessThenVisit(visitId, 1);

    expect(visit!.finishedAt).toEqual(FIXED_NOW);
  });

  it("stamps the next node's start event with the visit whose report caused it", async () => {
    const { runId, visitId } = await openEntryVisit();

    await store().report(visitId, { outcome: "success" });
    const start = (await events().listByRun(runId)).find((event) => event.name === "node.retrospective.start");

    expect(start?.payload).toMatchObject({ nodeId: "retrospective", causedBy: { visitId } });
  });

  it("stamps the run's settling with the end marker's visit, whose report ended it", async () => {
    const { runId, opened } = await reviewSucceedsIntoRetrospective();
    const settled = (await events().listByRun(runId)).find((event) => event.name === "internal.run.settled");

    expect(settled?.payload).toMatchObject({ causedBy: { visitId: opened.visit.id } });
  });

  it("posts the next node's start event", async () => {
    const { runId, visitId } = await openEntryVisit();

    await store().report(visitId, { outcome: "success" });
    const runEvents = await events().listByRun(runId);

    expect(runEvents.map((event) => event.name)).toContain("node.retrospective.start");
  });

  it("merges a produced value into the bag", async () => {
    const { runId, visitId } = await openEntryVisit();

    await store().report(visitId, { outcome: "success", produced: { review_verdict: "success" } });
    const bag = await store().bag(runId);

    expect(bag.review_verdict).toEqual({ kind: "value", ref: "success", by: visitId });
  });

  it("marks a produced file item with the file kind, per the station's produces spec", async () => {
    const { runId, visitId } = await openEntryVisit();

    await store().report(visitId, { outcome: "success", produced: { review_findings: "sha256-findings" } });
    const bag = await store().bag(runId);

    expect(bag.review_findings).toEqual({ kind: "file", ref: "sha256-findings", by: visitId });
  });

  it("settles the run once the walk reaches the exit", async () => {
    const { run } = await reviewSucceedsIntoRetrospective();

    expect(run!.outcome).toBe("success");
  });

  it("posts internal.run.settled once the run finishes", async () => {
    const { runEvents } = await reviewSucceedsIntoRetrospective();

    expect(runEvents).toContain("internal.run.settled");
  });

  it("retries the same node at a bumped iteration on a failed outcome", async () => {
    const { runId, visitId } = await openEntryVisit();

    await store().report(visitId, { outcome: "failed", error: "boom" });
    const runEvents = await events().listByRun(runId);
    const retry = runEvents.find((event) => event.name === "node.review.start" && event.id !== runEvents[0]!.id);

    expect(retry).toBeDefined();
  });

  it("fails the run with iteration_max once the retry budget is spent", async () => {
    const { runId, visitId } = await openEntryVisit();

    await store().report(visitId, { outcome: "failed", error: "boom" });
    await store().openVisit(runId, "review", 2);
    const secondVisit = (await store().visits(runId))[1]!;

    await store().report(secondVisit.id, { outcome: "failed", error: "boom again" });
    const run = await store().get(runId);

    expect(run!.outcome).toBe("iteration_max");
  });

  it("fails the run on purpose when failed is routed to the line's fail node", async () => {
    const { runId, visitId } = await openEntryVisit(FAIL_ROUTED_LINE);

    await store().report(visitId, { outcome: "failed", error: "boom" });
    const run = await store().get(runId);

    expect(run).toMatchObject({ outcome: "failed", reason: 'AssemblyLine code-review: node "review" reported "failed"' });
  });

  it("says failed, and the node that reported it, in internal.run.settled when the run ends at the fail node", async () => {
    const { runId, visitId } = await openEntryVisit(FAIL_ROUTED_LINE);

    await store().report(visitId, { outcome: "failed", error: "boom" });
    const runEvents = await events().listByRun(runId);
    const settled = runEvents.find((event) => event.name === "internal.run.settled");

    expect(settled?.payload).toMatchObject({ runId, outcome: "failed", reason: 'AssemblyLine code-review: node "review" reported "failed"' });
  });

  it("opens no visit on the fail node", async () => {
    const { runId, visitId } = await openEntryVisit(FAIL_ROUTED_LINE);

    await store().report(visitId, { outcome: "failed", error: "boom" });
    const visits = await store().visits(runId);

    expect(visits.map((visit) => visit.nodeId)).toEqual(["review"]);
  });
});

describe("AssemblyRunStore: failure context", () => {
  it("carries the previous visit's error as previous_error on the retry", async () => {
    const { runId, visitId } = await openEntryVisit();

    await store().report(visitId, { outcome: "failed", error: "lint failed" });
    const retry = await store().openVisit(runId, "review", 2);
    const retryBrief = retry.visit.brief;

    expect(retryBrief.needs.previous_error).toBe("lint failed");
  });

  it("carries no previous_error into a fresh node's first visit", async () => {
    const { visitId } = await openEntryVisit();
    const visit = await store().visit(visitId);
    const needs = visit!.brief.needs;

    expect(needs.previous_error).toBeUndefined();
  });
});

describe("AssemblyRunStore.cancel", () => {
  it("settles the run with the cancelled outcome", async () => {
    const { runId } = await openEntryVisit();

    const run = await store().cancel(runId, "no longer needed");

    expect(run.outcome).toBe("cancelled");
  });

  it("drops the run's queued events", async () => {
    const { runId } = await openEntryVisit();

    await store().cancel(runId, "no longer needed");
    const dispatch = await pool().query("select dropped_at from events where run_id = $1 and name = 'station_run.dispatch'", [runId]);
    const row = dispatch.rows[0];

    expect(row.dropped_at).not.toBeNull();
  });

  it("aborts each open visit", async () => {
    const { runId } = await openEntryVisit();

    await store().cancel(runId, "no longer needed");
    const runEvents = await events().listByRun(runId);

    expect(runEvents.map((event) => event.name)).toContain("station_run.abort");
  });

  it("refuses to cancel a run that already settled", async () => {
    const { runId, visitId } = await openEntryVisit();

    await store().report(visitId, { outcome: "success" });
    await store().openVisit(runId, "retrospective", 1);

    await expect(store().cancel(runId, "too late")).rejects.toThrow(/already finished/);
  });
});

describe("AssemblyRunStore.list", () => {
  it("filters to one repo", async () => {
    await seedReviewLine();
    await store().start({ lineId: "code-review", repo: "github.com/a/a", startItems: startItems() });
    await store().start({
      lineId: "code-review",
      repo: "github.com/b/b",
      startItems: { ...startItems(), pr_url: { kind: "value", ref: "https://github.com/b/b/pull/1", by: "start" } },
    });

    const page = await store().list({ repo: "github.com/a/a" }, { limit: 10 });

    expect(page.items).toHaveLength(1);
  });

  it("filters to open runs only", async () => {
    const { runId } = await openEntryVisit();
    await store().cancel(runId, "done for now");

    const page = await store().list({ open: true }, { limit: 10 });

    expect(page.items).toHaveLength(0);
  });
});

describe("AssemblyRunStore.report: releasing the worker", () => {
  async function aborts(runId: string) {
    const runEvents = await events().listByRun(runId);

    return runEvents.filter((event) => event.name === "station_run.abort");
  }

  async function reportedAfterClaim(times: number) {
    const { runId, visitId } = await openEntryVisit();

    await events().claim({ names: ["station_run.dispatch"], tags: ["kind:agent"], limit: 1, claimedBy: "cluster-agent" });

    for (let attempt = 0; attempt < times; attempt++) {
      await store().report(visitId, { outcome: "success" });
    }

    return { visitId, aborts: await aborts(runId) };
  }

  it("tells the worker that claimed the dispatch to let go of the visit", async () => {
    const reported = await reportedAfterClaim(1);

    expect(reported.aborts).toMatchObject([{ payload: { visitId: reported.visitId }, tags: ["kind:agent"] }]);
  });

  it("tells it once, though the report is replayed", async () => {
    const reported = await reportedAfterClaim(2);

    expect(reported.aborts).toHaveLength(1);
  });

  it("tells nobody when no worker ever claimed the dispatch", async () => {
    const { runId, visitId } = await openEntryVisit();

    await store().report(visitId, { outcome: "success" });

    expect(await aborts(runId)).toEqual([]);
  });
});


describe("AssemblyRunStore.report, on an agent visit that cost nothing", () => {
  async function costEventsAfterReport(records: RecordInput[]): Promise<string[]> {
    const { runId, visitId } = await openEntryVisit();

    if (records.length > 0) await new RecordsStore({ pool: pool() }).append(visitId, records);
    await store().report(visitId, { outcome: "success" });

    return (await events().listByRun(runId)).filter((event) => event.name === "internal.cost.missing").map((event) => event.name);
  }

  function llmCall(body: unknown): RecordInput {
    return { kind: "llm_call", body, occurredAt: FIXED_NOW };
  }

  it("raises internal.cost.missing when the visit has no llm_call record", async () => {
    expect(await costEventsAfterReport([])).toEqual(["internal.cost.missing"]);
  });

  it("raises internal.cost.missing when its only llm_call states no costUsd", async () => {
    expect(await costEventsAfterReport([llmCall({ usage: { input_tokens: 10 } })])).toEqual(["internal.cost.missing"]);
  });

  it("names the visit and its agent definition in the event", async () => {
    const { runId, visitId } = await openEntryVisit();

    await store().report(visitId, { outcome: "success" });
    const [raised] = (await events().listByRun(runId)).filter((event) => event.name === "internal.cost.missing");

    expect(raised).toMatchObject({ payload: { visitId, nodeId: "review" }, runId });
  });

  it("raises nothing when an llm_call states a costUsd", async () => {
    expect(await costEventsAfterReport([llmCall({ costUsd: 0.0125 })])).toEqual([]);
  });

  it("raises nothing for a node with no station, which called no model", async () => {
    const { runId } = await reviewSucceedsIntoRetrospective();
    const raised = (await events().listByRun(runId)).filter((event) => event.name === "internal.cost.missing");

    expect(raised.map((event) => event.payload)).toEqual([{ visitId: expect.any(String), nodeId: "review" }]);
  });

  it("raises it once, though the report is replayed", async () => {
    const { runId, visitId } = await openEntryVisit();

    await store().report(visitId, { outcome: "success" });
    await store().report(visitId, { outcome: "success" });
    const raised = (await events().listByRun(runId)).filter((event) => event.name === "internal.cost.missing");

    expect(raised).toHaveLength(1);
  });
});
