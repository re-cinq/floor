import { describe, expect, it } from "vitest";
import { setupStoreFixture } from "./assembly-run-store.fixtures.js";
import type { Item, LineBody, StationBody } from "./types.js";

const { store, definitions } = setupStoreFixture();

const LINE: LineBody = {
  entry: "judge",
  exit: "done",
  args: { ticket: { kind: "value" } },
  nodes: [
    { id: "judge", station: "judge" },
    { id: "author", station: "author" },
    { id: "consume", station: "consume" },
    { id: "done" },
  ],
  edges: [
    { from: "judge", to: "author", on: "success" },
    { from: "author", to: "consume", on: "success" },
    { from: "consume", to: "done", on: "success" },
  ],
};

const JUDGE_STATION: StationBody = {
  kind: "service",
  outcomes: ["success"],
  needs: [],
  produces: [{ name: "verdict", kind: "value" }],
};

const AUTHOR_STATION: StationBody = {
  kind: "human",
  outcomes: ["success"],
  needs: [],
  produces: [{ name: "feedback", kind: "value" }],
  route: "/feedback",
};

const START_ITEMS: Record<string, Item> = { ticket: { kind: "value", ref: "T-1", by: "start" } };

async function runConsuming(needs: StationBody["needs"]): Promise<string> {
  const consumer: StationBody = { kind: "service", outcomes: ["success"], needs, produces: [] };

  await definitions().put("line", "feedback", LINE);
  await definitions().put("station", "judge", JUDGE_STATION);
  await definitions().put("station", "author", AUTHOR_STATION);
  await definitions().put("station", "consume", consumer);
  const { run } = await store().start({ lineId: "feedback", repo: "r", startItems: START_ITEMS });

  return run.id;
}

async function judgeProduces(runId: string, verdict: string): Promise<void> {
  const { visit } = await store().openVisit(runId, "judge", 1);

  await store().report(visit.id, { outcome: "success", produced: { verdict } });
}

async function authorActs(runId: string, produced: Record<string, string>): Promise<void> {
  const { visit } = await store().openVisit(runId, "author", 1);

  await store().report(visit.id, { outcome: "success", produced });
}

async function briefNeedsOfConsume(runId: string): Promise<Record<string, string>> {
  const { visit } = await store().openVisit(runId, "consume", 1);

  return visit.brief.needs;
}

describe("a fresh need at open", () => {
  it("leaves an optional fresh verdict out of the brief when judge produced it before the human reported", async () => {
    const runId = await runConsuming([{ name: "verdict", kind: "value", optional: true, fresh: true }]);

    await judgeProduces(runId, "approved");
    await authorActs(runId, {});

    expect(await briefNeedsOfConsume(runId)).toEqual({});
  });

  it("puts a fresh feedback the human visit produced in the next visit's brief", async () => {
    const runId = await runConsuming([{ name: "feedback", kind: "value", fresh: true }]);

    await judgeProduces(runId, "approved");
    await authorActs(runId, { feedback: "tighten it" });

    expect(await briefNeedsOfConsume(runId)).toEqual({ feedback: "tighten it" });
  });

  it("refuses the open of a required fresh verdict that judge produced before the human reported", async () => {
    const runId = await runConsuming([{ name: "verdict", kind: "value", fresh: true }]);

    await judgeProduces(runId, "approved");
    await authorActs(runId, {});

    await expect(store().openVisit(runId, "consume", 1)).rejects.toThrow(
      new Error('node "consume": missing required need(s) verdict (not produced since a person last acted)'),
    );
  });

  it("puts a fresh ticket from the start items in the brief before any human visit", async () => {
    const runId = await runConsuming([{ name: "ticket", kind: "value", fresh: true }]);

    expect(await briefNeedsOfConsume(runId)).toEqual({ ticket: "T-1" });
  });

  it("leaves an optional fresh verdict out of the brief of a visit started by hand with no human visit yet", async () => {
    const runId = await runConsuming([{ name: "verdict", kind: "value", optional: true, fresh: true }]);

    await judgeProduces(runId, "approved");
    const { visit } = await store().openVisitByHand(runId, "consume", "ana");

    expect(visit.brief.needs).toEqual({});
  });
});
