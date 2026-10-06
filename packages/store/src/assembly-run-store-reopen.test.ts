import { describe, expect, it } from "vitest";
import { setupStoreFixture, startItems } from "./assembly-run-store.fixtures.js";
import { Refusal } from "./refusal.js";

const { store, events, openEntryVisit } = setupStoreFixture();

const PR_SUBJECT = "pr_url:https://github.com/re-cinq/lore/pull/412";

async function walkedThroughRetrospective(runId: string, iteration: number): Promise<void> {
  await store().openVisit(runId, "retrospective", iteration);
}

async function settledAsSuccess(): Promise<string> {
  const { runId, visitId } = await openEntryVisit();

  await store().report(visitId, { outcome: "success" });
  await walkedThroughRetrospective(runId, 1);

  return runId;
}

async function reviewStartedByAna(runId: string) {
  const opened = await store().openVisitByHand(runId, "review", "ana");
  const run = await store().get(runId);
  const runEvents = await events().listByRun(runId);

  return { opened, run, runEvents };
}

async function cancelledWithReviewOpen(): Promise<string> {
  const { runId } = await openEntryVisit();

  await store().cancel(runId, "not needed");

  return runId;
}

async function cancelledBesideAnOpenRun(): Promise<{ cancelledId: string; openId: string }> {
  const cancelledId = await cancelledWithReviewOpen();
  const { run } = await store().start({ lineId: "code-review", repo: "github.com/re-cinq/lore", startItems: startItems() });

  return { cancelledId, openId: run.id };
}

describe("AssemblyRunStore.openVisitByHand on a run settled as success", () => {
  it("reopens a settled run when a person starts its review node", async () => {
    const runId = await settledAsSuccess();

    const { run } = await reviewStartedByAna(runId);

    expect(run).toMatchObject({ finishedAt: null, outcome: null, reason: null });
  });

  it("opens the review node at iteration 2, recording that ana asked", async () => {
    const runId = await settledAsSuccess();

    const { opened } = await reviewStartedByAna(runId);

    expect(opened).toMatchObject({ created: true, visit: { nodeId: "review", iteration: 2, requestedBy: "ana" } });
  });

  it("posts internal.run.reopened naming the run and that ana asked", async () => {
    const runId = await settledAsSuccess();

    const { runEvents } = await reviewStartedByAna(runId);
    const reopened = runEvents.find((event) => event.name === "internal.run.reopened");

    expect(reopened?.payload).toMatchObject({ runId, lineId: "code-review", subjectKey: PR_SUBJECT, outcome: null, requestedBy: "ana" });
  });

  it("settles the run as success a second time once the reopened review walks on to done", async () => {
    const runId = await settledAsSuccess();
    const { opened } = await reviewStartedByAna(runId);

    await store().report(opened.visit.id, { outcome: "success" });
    await walkedThroughRetrospective(runId, 2);
    const run = await store().get(runId);
    const settlings = (await events().listByRun(runId)).filter((event) => event.name === "internal.run.settled");

    expect({ outcome: run?.outcome, settlings: settlings.length }).toEqual({ outcome: "success", settlings: 2 });
  });
});

describe("AssemblyRunStore.openVisitByHand on a run cancelled with its review open", () => {
  it("closes the review visit the cancel left open as cancelled, and opens review 2", async () => {
    const runId = await cancelledWithReviewOpen();

    await reviewStartedByAna(runId);
    const visits = await store().visits(runId);

    expect(visits.map((visit) => `${visit.nodeId}#${visit.iteration} ${visit.report?.outcome ?? "open"}`)).toEqual(["review#1 cancelled", "review#2 open"]);
  });

  it("launches retrospective 2 once review 2 reports, rather than awaiting review 1", async () => {
    const runId = await cancelledWithReviewOpen();
    const { opened } = await reviewStartedByAna(runId);

    await store().report(opened.visit.id, { outcome: "success" });

    expect(await store().next(runId)).toEqual({ kind: "launch", nodeId: "retrospective", iteration: 2 });
  });
});

describe("AssemblyRunStore.openVisitByHand on a settled run whose subject another open run holds", () => {
  it("refuses, naming the open run", async () => {
    const { cancelledId, openId } = await cancelledBesideAnOpenRun();

    await expect(store().openVisitByHand(cancelledId, "review", "ana")).rejects.toThrow(
      new Refusal(`run "${cancelledId}" cannot reopen: run "${openId}" is open on its subject "${PR_SUBJECT}"`),
    );
  });

  it("leaves the settled run cancelled, its review visit open and nothing posted", async () => {
    const { cancelledId } = await cancelledBesideAnOpenRun();

    await store().openVisitByHand(cancelledId, "review", "ana").catch(() => undefined);
    const run = await store().get(cancelledId);
    const visits = await store().visits(cancelledId);
    const runEvents = await events().listByRun(cancelledId);

    expect({ outcome: run?.outcome, visits: visits.length, reopened: runEvents.some((event) => event.name === "internal.run.reopened") }).toEqual({
      outcome: "cancelled",
      visits: 1,
      reopened: false,
    });
  });
});

describe("AssemblyRunStore.openVisit on a settled run", () => {
  it("refuses the walk's start of review 2: a stale walk event never reopens a run", async () => {
    const runId = await settledAsSuccess();

    await expect(store().openVisit(runId, "review", 2)).rejects.toThrow(new Refusal(`run "${runId}" is already finished`));
  });
});
