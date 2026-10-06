import { describe, expect, it } from "vitest";
import { Refusal } from "./refusal.js";
import { setupStoreFixture } from "./assembly-run-store.fixtures.js";
import type { LineBody, StationBody } from "./types.js";

const { store, definitions } = setupStoreFixture();

const PLAN_LINE: LineBody = {
  entry: "draft",
  exit: "done",
  args: {},
  nodes: [
    { id: "draft", station: "plan-draft" },
    { id: "author", station: "plan-author" },
    { id: "write", station: "plan-write" },
    { id: "done" },
  ],
  edges: [
    { from: "draft", to: "author", on: "success" },
    { from: "author", to: "write", on: "success" },
    { from: "author", to: "draft", on: "changes_requested" },
    { from: "write", to: "done", on: "success" },
  ],
};

const SERVICE_STATION: StationBody = { kind: "service", outcomes: ["success"], needs: [], produces: [] };
const AUTHOR_STATION: StationBody = {
  kind: "human",
  outcomes: ["success", "changes_requested"],
  needs: [],
  produces: [],
  route: "/plans",
};

async function seedPlanLine(): Promise<void> {
  await definitions().put("line", "plan", PLAN_LINE);
  await definitions().put("station", "plan-draft", SERVICE_STATION);
  await definitions().put("station", "plan-author", AUTHOR_STATION);
  await definitions().put("station", "plan-write", SERVICE_STATION);
}

async function authorAnswers(outcome: string) {
  await seedPlanLine();
  const { run } = await store().start({ lineId: "plan", repo: "r", startItems: {}, entry: "author" });
  const { visit } = await store().openVisit(run.id, "author", 1);

  await store().report(visit.id, { outcome });

  return { next: await store().next(run.id), run: await store().get(run.id) };
}

describe("a run started at author, a node other than the line's entry draft", () => {
  it("launches write once author reports success, and stays open", async () => {
    const { next, run } = await authorAnswers("success");

    expect({ next, finishedAt: run?.finishedAt ?? null }).toEqual({
      next: { kind: "launch", nodeId: "write", iteration: 1 },
      finishedAt: null,
    });
  });

  it("launches draft at iteration 1 once author reports changes_requested", async () => {
    const { next } = await authorAnswers("changes_requested");

    expect(next).toEqual({ kind: "launch", nodeId: "draft", iteration: 1 });
  });
});

describe("AssemblyRunStore.start at a terminal node", () => {
  async function startAt(entry: string): Promise<unknown> {
    await seedPlanLine();

    return store().start({ lineId: "plan", repo: "r", startItems: {}, entry });
  }

  it("refuses the exit, which no visit is ever opened on", async () => {
    await expect(startAt("done")).rejects.toThrow(new Refusal(`line "plan": node "done" ends a run, so a run cannot start there`));
  });
});
