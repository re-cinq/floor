import { describe, expect, it } from "vitest";
import { BlobsStore } from "./blobs.js";
import { FAN_STATIONS, fanLine } from "./fanout.fixtures.js";
import { setupStoreFixture } from "./assembly-run-store.fixtures.js";

const { store, events, definitions, pool } = setupStoreFixture();

async function runAfterSplit(listed: string[]): Promise<string> {
  await seedFanLine();
  const { run } = await store().start({
    lineId: "fan",
    repo: null,
    startItems: {},
  });
  const { visit } = await store().openVisit(run.id, "split", 1);

  await store().report(visit.id, {
    outcome: "success",
    produced: { items: JSON.stringify(listed) },
  });

  return run.id;
}

async function seedFanLine(): Promise<void> {
  await definitions().put("line", "fan", fanLine());
  for (const [id, body] of Object.entries(FAN_STATIONS))
    await definitions().put("station", id, body);
}

async function startsOf(runId: string, node: string) {
  const all = await events().listByRun(runId);

  return all
    .filter((event) => event.name === `node.${node}.start`)
    .map((event) => event.payload);
}

async function openBranches(runId: string, count: number): Promise<string[]> {
  const opened = await Promise.all(
    Array.from({ length: count }, (unused, branch) =>
      store().openVisit(runId, "work", 1, branch),
    ),
  );

  return opened.map(({ visit }) => visit.id);
}

describe("AssemblyRunStore across a fan-out", () => {
  it("posts one start event per item, each naming its branch", async () => {
    const runId = await runAfterSplit(["a", "b", "c"]);

    expect(await startsOf(runId, "work")).toEqual([
      { runId, nodeId: "work", iteration: 1, branch: 0 },
      { runId, nodeId: "work", iteration: 1, branch: 1 },
      { runId, nodeId: "work", iteration: 1, branch: 2 },
    ]);
  });

  it("opens a branch's visit with its own item as the item need", async () => {
    const runId = await runAfterSplit(["a", "b", "c"]);

    const { visit } = await store().openVisit(runId, "work", 1, 1);

    const { needs } = visit.brief;

    expect({ branch: visit.branch, item: needs.item }).toEqual({
      branch: 1,
      item: "b",
    });
  });

  it("opens the same branch once and a second branch beside it", async () => {
    const runId = await runAfterSplit(["a", "b"]);

    const first = await store().openVisit(runId, "work", 1, 0);
    const again = await store().openVisit(runId, "work", 1, 0);
    const second = await store().openVisit(runId, "work", 1, 1);

    expect([
      again.created,
      again.visit.id === first.visit.id,
      second.created,
    ]).toEqual([false, true, true]);
  });

  it("starts the join only when the last branch has reported", async () => {
    const runId = await runAfterSplit(["a", "b", "c"]);
    const branches = await openBranches(runId, 3);

    await store().report(branches[0]!, {
      outcome: "success",
      produced: { result: "r0" },
    });
    await store().report(branches[2]!, {
      outcome: "success",
      produced: { result: "r2" },
    });
    const before = await startsOf(runId, "merge");

    await store().report(branches[1]!, {
      outcome: "success",
      produced: { result: "r1" },
    });

    expect({ before, after: await startsOf(runId, "merge") }).toEqual({
      before: [],
      after: [{ runId, nodeId: "merge", iteration: 1 }],
    });
  });

  it("starts the join once when the last two branches report at the same time", async () => {
    const runId = await runAfterSplit(["a", "b"]);
    const branches = await openBranches(runId, 2);

    await Promise.all(
      branches.map((visitId) =>
        store().report(visitId, {
          outcome: "success",
          produced: { result: "x" },
        }),
      ),
    );

    expect(await startsOf(runId, "merge")).toHaveLength(1);
  });

  it("hands the join every branch's output in branch order, however they reported", async () => {
    const runId = await runAfterSplit(["a", "b", "c"]);
    const branches = await openBranches(runId, 3);

    await store().report(branches[2]!, {
      outcome: "success",
      produced: { result: "r2" },
    });
    await store().report(branches[0]!, {
      outcome: "success",
      produced: { result: "r0" },
    });
    await store().report(branches[1]!, {
      outcome: "success",
      produced: { result: "r1" },
    });
    const { visit } = await store().openVisit(runId, "merge", 1);

    const { needs } = visit.brief;

    expect(JSON.parse(needs.results!)).toEqual(["r0", "r1", "r2"]);
  });

  it("fails the run when a branch failed, after every branch has reported", async () => {
    const runId = await runAfterSplit(["a", "b"]);
    const branches = await openBranches(runId, 2);

    await store().report(branches[0]!, { outcome: "failed" });
    const midway = await store().get(runId);

    await store().report(branches[1]!, {
      outcome: "success",
      produced: { result: "r1" },
    });
    const settled = await store().get(runId);

    expect([midway!.finishedAt, settled!.outcome]).toEqual([null, "failed"]);
  });

  it("goes straight to the join when the list is empty", async () => {
    const runId = await runAfterSplit([]);

    expect({
      work: await startsOf(runId, "work"),
      merge: await startsOf(runId, "merge"),
    }).toEqual({
      work: [],
      merge: [{ runId, nodeId: "merge", iteration: 1 }],
    });
  });

  it("hands the join the text of each branch's file output, in branch order", async () => {
    await definitions().put("line", "fan", fanLine());
    const fileWorker = { ...FAN_STATIONS.worker!, produces: [{ name: "result", kind: "file" as const }] };

    await definitions().put("station", "splitter", FAN_STATIONS.splitter!);
    await definitions().put("station", "worker", fileWorker);
    await definitions().put("station", "merger", FAN_STATIONS.merger!);
    const { run } = await store().start({ lineId: "fan", repo: null, startItems: {} });
    const { visit: entry } = await store().openVisit(run.id, "split", 1);

    await store().report(entry.id, { outcome: "success", produced: { items: JSON.stringify(["a", "b"]) } });
    const blobs = new BlobsStore({ connection: pool() });
    const branches = await openBranches(run.id, 2);

    for (const [index, visitId] of [...branches.entries()].reverse().map(([index, id]) => [index, id] as const)) {
      const { hash } = await blobs.put(Buffer.from(`patch ${index}`));

      await store().report(visitId, { outcome: "success", produced: { result: hash } });
    }

    const { visit } = await store().openVisit(run.id, "merge", 1);
    const { needs } = visit.brief;

    expect(JSON.parse(needs.results!)).toEqual(["patch 0", "patch 1"]);
  });
});
