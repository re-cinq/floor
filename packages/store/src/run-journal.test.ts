import { describe, expect, it } from "vitest";
import { setupStoreFixture, startItems, FIXED_NOW } from "./assembly-run-store.fixtures.js";
import { RecordsStore } from "./records.js";
import { RunJournal, type JournalEntry } from "./run-journal.js";

const { pool, store, seedReviewLine } = setupStoreFixture();

const EVERYTHING = 100;

function journal(): RunJournal {
  return new RunJournal({ pool: pool() });
}

function records(): RecordsStore {
  return new RecordsStore({ pool: pool() });
}

async function reviewStarted(prUrl = "https://github.com/re-cinq/lore/pull/412"): Promise<{ runId: string; visitId: string }> {
  await seedReviewLine();
  const { run } = await store().start({ lineId: "code-review", repo: "github.com/re-cinq/lore", startItems: { ...startItems(), pr_url: { kind: "value", ref: prUrl, by: "start" } } });
  const { visit } = await store().openVisit(run.id, "review", 1);

  return { runId: run.id, visitId: visit.id };
}

async function entriesOf(runId: string, after = 0): Promise<JournalEntry[]> {
  const page = await journal().since(runId, after, EVERYTHING);

  return page!.items;
}

function told(entries: JournalEntry[]): string[] {
  return entries.map((entry) => `${entry.seq} ${entry.kind}`);
}

describe("the run journal", () => {
  it("numbers a run's entries 1, 2, 3 across a visit opening, a record and a report", async () => {
    const { runId, visitId } = await reviewStarted();

    await records().append(visitId, [{ kind: "turn", body: { said: "looking" }, occurredAt: FIXED_NOW }]);
    await store().report(visitId, { outcome: "failed", error: "lint failed" });

    expect(told(await entriesOf(runId)).slice(0, 3)).toEqual(["1 visit_opened", "2 record", "3 visit_reported"]);
  });

  it("ends with the run settling", async () => {
    const { runId } = await reviewStarted();

    await store().cancel(runId, "no longer wanted");
    const entries = await entriesOf(runId);

    expect(entries.at(-1)).toMatchObject({ kind: "run_settled", run: { outcome: "cancelled", reason: "no longer wanted" } });
  });

  it("tells a cancelled run reopened by hand: settled, reopened, its left-open visit closed, the new one opened", async () => {
    const { runId } = await reviewStarted();

    await store().cancel(runId, "no longer wanted");
    await store().openVisitByHand(runId, "review", "ana");

    expect(told(await entriesOf(runId))).toEqual(["1 visit_opened", "2 run_settled", "3 run_reopened", "4 visit_reported", "5 visit_opened"]);
  });

  it("carries the reopened run, open again", async () => {
    const { runId } = await reviewStarted();

    await store().cancel(runId, "no longer wanted");
    await store().openVisitByHand(runId, "review", "ana");
    const reopened = (await entriesOf(runId)).find((entry) => entry.kind === "run_reopened");

    expect(reopened).toMatchObject({ run: { id: runId, finishedAt: null, outcome: null } });
  });

  it("carries a record whole, with the node it was said at", async () => {
    const { runId, visitId } = await reviewStarted();

    await records().append(visitId, [{ kind: "turn", body: { said: "looking" }, occurredAt: FIXED_NOW }]);
    const [, entry] = await entriesOf(runId);

    expect(entry).toMatchObject({ kind: "record", visit: { id: visitId, nodeId: "review", iteration: 1 }, record: { kind: "turn", seq: 1, body: { said: "looking" } } });
  });

  it("tells a visit as it was opened, with no report, though it has one by now", async () => {
    const { runId, visitId } = await reviewStarted();

    await store().report(visitId, { outcome: "failed", error: "lint failed" });
    const [opened] = await entriesOf(runId);

    expect(opened).toMatchObject({ kind: "visit_opened", visit: { id: visitId, report: null } });
  });

  it("tells a visit's report", async () => {
    const { runId, visitId } = await reviewStarted();

    await store().report(visitId, { outcome: "failed", error: "lint failed" });
    const reported = (await entriesOf(runId)).find((entry) => entry.kind === "visit_reported");

    expect(reported).toMatchObject({ visit: { id: visitId, report: { outcome: "failed", error: "lint failed" } } });
  });

  it("keeps each run's numbering its own", async () => {
    const first = await reviewStarted("https://github.com/re-cinq/lore/pull/1");
    const second = await reviewStarted("https://github.com/re-cinq/lore/pull/2");

    await records().append(first.visitId, [{ kind: "log", body: {}, occurredAt: FIXED_NOW }]);

    expect(told(await entriesOf(second.runId))).toEqual(["1 visit_opened"]);
  });

  it("leaves a session record out: where a conversation was saved is the sink's own note", async () => {
    const { runId, visitId } = await reviewStarted();

    await records().append(visitId, [{ kind: "session", body: { ref: "sha256-abc" }, occurredAt: FIXED_NOW }]);

    expect(told(await entriesOf(runId))).toEqual(["1 visit_opened"]);
  });

  it("takes a record of a visit nobody opened, and journals nothing for it", async () => {
    const appended = await records().append("11111111-2222-3333-4444-555555555555", [{ kind: "log", body: {}, occurredAt: FIXED_NOW }]);

    expect(appended).toHaveLength(1);
  });

  it("numbers fifty records written through two visits at the same moment 3 to 52, with no gap", async () => {
    const { runId, visitId } = await reviewStarted();
    const again = await store().openVisit(runId, "review", 2);
    const writes = Array.from({ length: 50 }, (unused, index) => records().append(index % 2 ? visitId : again.visit.id, [{ kind: "turn", body: {}, occurredAt: FIXED_NOW }]));

    await Promise.all(writes);
    const entries = await entriesOf(runId);

    expect(entries.map((entry) => entry.seq)).toEqual(Array.from({ length: 52 }, (unused, index) => index + 1));
  });

  it("reads only what came after seq 2 for a reader that has seen 2", async () => {
    const { runId, visitId } = await reviewStarted();

    await records().append(visitId, [
      { kind: "turn", body: {}, occurredAt: FIXED_NOW },
      { kind: "turn", body: {}, occurredAt: FIXED_NOW },
    ]);

    expect(told(await entriesOf(runId, 2))).toEqual(["3 record"]);
  });

  it("says where to read on from when there is more than it was asked for", async () => {
    const { runId, visitId } = await reviewStarted();

    await records().append(visitId, [{ kind: "turn", body: {}, occurredAt: FIXED_NOW }]);
    const page = await journal().since(runId, 0, 1);

    expect(page?.nextCursor).toBe(1);
  });

  it("is null for a run that does not exist", async () => {
    expect(await journal().since("11111111-2222-3333-4444-555555555555", 0, EVERYTHING)).toBeNull();
  });
});
