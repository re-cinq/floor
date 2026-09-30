import { describe, expect, it } from "vitest";
import { Refusal } from "./refusal.js";
import { FIXED_NOW, setupStoreFixture, startItems } from "./assembly-run-store.fixtures.js";

const { pool, store, seedReviewLine, openEntryVisit } = setupStoreFixture();

const LONG_AGO = new Date("2020-01-01T00:00:00Z");
const BEFORE_THE_RUNS = new Date("2019-01-01T00:00:00Z");
const AFTER_THE_RUNS = new Date("2999-01-01T00:00:00Z");

async function startRunOn(repo: string, prUrl: string): Promise<string> {
  const { run } = await store().start({
    lineId: "code-review",
    repo,
    startItems: { ...startItems(), pr_url: { kind: "value", ref: prUrl, by: "start" } },
  });

  return run.id;
}

async function backdateRun(runId: string, createdAt: Date): Promise<void> {
  await pool().query("update assembly_runs set created_at = $2 where id = $1", [runId, createdAt]);
}

async function backdateVisit(visitId: string, openedAt: Date): Promise<void> {
  await pool().query("update station_runs set opened_at = $2 where station_run_id = $1", [visitId, openedAt]);
}

describe("AssemblyRunStore.list since", () => {
  it("leaves out a run created before the floor", async () => {
    await seedReviewLine();
    const old = await startRunOn("github.com/a/a", "https://github.com/a/a/pull/1");
    const recent = await startRunOn("github.com/a/a", "https://github.com/a/a/pull/2");

    await backdateRun(old, LONG_AGO);
    const page = await store().list({ since: FIXED_NOW }, { limit: 10 });

    expect(page.items.map((run) => run.id)).toEqual([recent]);
  });

  it("keeps a run created exactly at the floor", async () => {
    await seedReviewLine();
    const runId = await startRunOn("github.com/a/a", "https://github.com/a/a/pull/1");

    await backdateRun(runId, LONG_AGO);
    const page = await store().list({ since: LONG_AGO }, { limit: 10 });

    expect(page.items.map((run) => run.id)).toEqual([runId]);
  });

  it("combines with repo", async () => {
    await seedReviewLine();
    await startRunOn("github.com/a/a", "https://github.com/a/a/pull/1");
    await startRunOn("github.com/b/b", "https://github.com/b/b/pull/1");

    const page = await store().list({ repo: "github.com/a/a", since: BEFORE_THE_RUNS }, { limit: 10 });

    expect(page.items.map((run) => run.repo)).toEqual(["github.com/a/a"]);
  });

  it("pages on with the cursor while the floor holds", async () => {
    await seedReviewLine();
    await startRunOn("github.com/a/a", "https://github.com/a/a/pull/1");
    await startRunOn("github.com/a/a", "https://github.com/a/a/pull/2");
    await startRunOn("github.com/a/a", "https://github.com/a/a/pull/3");
    const first = await store().list({ since: BEFORE_THE_RUNS }, { limit: 2 });

    const second = await store().list({ since: BEFORE_THE_RUNS }, { limit: 2, cursor: first.nextCursor ?? undefined });

    expect({ first: first.items.length, second: second.items.length }).toEqual({ first: 2, second: 1 });
  });

  it("returns nothing when the floor is after every run", async () => {
    await seedReviewLine();
    await startRunOn("github.com/a/a", "https://github.com/a/a/pull/1");

    const page = await store().list({ since: AFTER_THE_RUNS }, { limit: 10 });

    expect(page.items).toEqual([]);
  });
});

async function startRunsCreatedAt(createdAts: Date[]): Promise<string[]> {
  await seedReviewLine();
  const runIds: string[] = [];

  for (const [index, createdAt] of createdAts.entries()) {
    const runId = await startRunOn("github.com/a/a", `https://github.com/a/a/pull/${index + 1}`);

    await backdateRun(runId, createdAt);
    runIds.push(runId);
  }

  return runIds;
}

async function idsOfEveryPage(limit: number): Promise<string[][]> {
  const pages: string[][] = [];
  let cursor: string | undefined;

  do {
    const page = await store().list({ since: BEFORE_THE_RUNS }, { limit, cursor });

    pages.push(page.items.map((run) => run.id));
    cursor = page.nextCursor ?? undefined;
  } while (cursor);

  return pages;
}

describe("AssemblyRunStore.list order and cursor", () => {
  const OLDEST = new Date("2026-03-01T10:00:00Z");
  const MIDDLE = new Date("2026-03-02T10:00:00Z");
  const NEWEST = new Date("2026-03-03T10:00:00Z");

  it("returns runs created 03-01, 03-02 and 03-03 newest first, whatever their ids", async () => {
    const [oldest, middle, newest] = await startRunsCreatedAt([OLDEST, MIDDLE, NEWEST]);

    const page = await store().list({ since: BEFORE_THE_RUNS }, { limit: 10 });

    expect(page.items.map((run) => run.id)).toEqual([newest, middle, oldest]);
  });

  it("carries the time each run was created as createdAt", async () => {
    const [runId] = await startRunsCreatedAt([MIDDLE]);

    const run = await store().get(runId);

    expect(run?.createdAt).toEqual(MIDDLE);
  });

  it("pages limit 2 into the two newest, then the oldest, then nextCursor null", async () => {
    const [oldest, middle, newest] = await startRunsCreatedAt([OLDEST, MIDDLE, NEWEST]);

    const pages = await idsOfEveryPage(2);

    expect(pages).toEqual([[newest, middle], [oldest]]);
  });

  it("returns two runs created at the same instant exactly once across a page boundary", async () => {
    const runIds = await startRunsCreatedAt([OLDEST, MIDDLE, MIDDLE]);

    const pages = await idsOfEveryPage(2);

    expect(pages.flat().toSorted()).toEqual(runIds.toSorted());
  });

  it("keeps runs created within one millisecond in order across a page boundary", async () => {
    const [first, second, third] = await startRunsCreatedAt([OLDEST, OLDEST, OLDEST]);

    await pool().query("update assembly_runs set created_at = '2026-03-01 10:00:00.000123+00' where id = $1", [first]);
    await pool().query("update assembly_runs set created_at = '2026-03-01 10:00:00.000456+00' where id = $1", [second]);
    await pool().query("update assembly_runs set created_at = '2026-03-01 10:00:00.000789+00' where id = $1", [third]);
    const pages = await idsOfEveryPage(1);

    expect(pages.flat()).toEqual([third, second, first]);
  });

  it.each(["not-a-cursor", "0f3c9d2e-7b1a-4c5d-8e6f-1a2b3c4d5e6f", "MjAyNi0wMy0wMV9ub3QtYS11dWlk"])("refuses the cursor %s", async (cursor) => {
    await seedReviewLine();

    await expect(store().list({ since: BEFORE_THE_RUNS }, { limit: 2, cursor })).rejects.toThrow(new Refusal("malformed cursor"));
  });
});

describe("AssemblyRunStore.currentNode", () => {
  it("is null for a run with no visits", async () => {
    await seedReviewLine();
    const runId = await startRunOn("github.com/a/a", "https://github.com/a/a/pull/1");

    expect(await store().currentNode(runId)).toBeNull();
  });

  it("is the node of the open visit", async () => {
    const { runId } = await openEntryVisit();

    expect(await store().currentNode(runId)).toBe("review");
  });

  it("is the open visit, not a later one already reported", async () => {
    const { runId } = await openEntryVisit();

    await store().openVisit(runId, "retrospective", 1);

    expect(await store().currentNode(runId)).toBe("review");
  });

  it("is the most recently opened of two open visits", async () => {
    const { runId } = await openEntryVisit();

    await store().openVisit(runId, "review", 2);
    await pool().query("update station_runs set node_id = 'again' where assembly_run_id = $1 and iteration = 2", [runId]);

    expect(await store().currentNode(runId)).toBe("again");
  });

  it("is the last visit opened when none is open", async () => {
    const { runId, visitId } = await openEntryVisit();

    await store().report(visitId, { outcome: "success" });
    await store().openVisit(runId, "retrospective", 1);

    expect(await store().currentNode(runId)).toBe("retrospective");
  });
});

describe("AssemblyRunStore.visits since and station", () => {
  it("leaves out a visit opened before the floor", async () => {
    const { runId, visitId } = await openEntryVisit();

    await backdateVisit(visitId, LONG_AGO);

    expect(await store().visits(runId, { since: FIXED_NOW })).toEqual([]);
  });

  it("keeps the visits of the named station only", async () => {
    const { runId, visitId } = await openEntryVisit();

    await store().report(visitId, { outcome: "success" });
    await store().openVisit(runId, "retrospective", 1);
    const visits = await store().visits(runId, { station: "review" });

    expect(visits.map((visit) => visit.nodeId)).toEqual(["review"]);
  });

  it("returns nothing for a station no visit was at", async () => {
    const { runId } = await openEntryVisit();

    expect(await store().visits(runId, { station: "nowhere" })).toEqual([]);
  });
});
