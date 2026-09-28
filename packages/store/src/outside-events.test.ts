import { describe, expect, it } from "vitest";
import { setupStoreFixture } from "./assembly-run-store.fixtures.js";
import { OutsideEvents } from "./outside-events.js";
import type { LineBody, StationBody } from "./types.js";

const { pool, store, definitions } = setupStoreFixture();

const OPENED = "github.pull_request.opened";
const CLOSED = "github.pull_request.closed";
const PR_OPENED = { repository: "github.com/re-cinq/lore", head_ref: "feat", pull_request_url: "https://pr/412", draft: false };
const SUBJECT = { subjectKey: "pr_url:https://pr/412", repo: "github.com/re-cinq/lore" };

const MERGE_LINE: LineBody = {
  entry: "merged",
  exit: "done",
  start: { on: [OPENED], when: { draft: false }, args: { repo: "{repository}@{head_ref}", pr_url: "{pull_request_url}" } },
  args: { repo: { kind: "git" }, pr_url: { kind: "value", subject: true } },
  nodes: [
    { id: "merged", station: "pr-merged", reports: [{ on: CLOSED, when: { merged: true }, outcome: "success" }] },
    { id: "done" },
  ],
  edges: [{ from: "merged", to: "done", on: "success" }],
};

const NOTIFY_LINE: LineBody = {
  entry: "notify",
  exit: "done",
  start: { on: ["internal.run.settled"], when: { outcome: "success" }, args: { settled_run: "{runId}" } },
  args: { settled_run: { kind: "value" } },
  nodes: [{ id: "notify" }, { id: "done" }],
  edges: [{ from: "notify", to: "done", on: "always" }],
};

const HUMAN_STATION: StationBody = { kind: "human", outcomes: ["success"], needs: [], produces: [] };

function outside(): OutsideEvents {
  return new OutsideEvents({ pool: pool(), runs: store(), definitions: definitions() });
}

async function seed(): Promise<void> {
  await definitions().put("line", "merge", MERGE_LINE);
  await definitions().put("line", "notify", NOTIFY_LINE);
  await definitions().put("station", "pr-merged", HUMAN_STATION);
}

async function startedByPullRequest() {
  await seed();
  const started = await outside().startLines({ name: OPENED, payload: PR_OPENED });

  return started.map((result) => result.run);
}

async function waitingOnMerge() {
  const [run] = await startedByPullRequest();

  await store().openVisit(run!.id, "merged", 1);

  return run!;
}

describe("OutsideEvents.startLines", () => {
  it("starts the line declaring the event, with items rendered from the payload", async () => {
    const runs = await startedByPullRequest();

    expect(runs).toMatchObject([{ lineId: "merge", repo: "github.com/re-cinq/lore", subjectKey: "pr_url:https://pr/412" }]);
  });

  it("joins the open run on a second event for the same subject", async () => {
    await startedByPullRequest();

    const again = await outside().startLines({ name: OPENED, payload: PR_OPENED });

    expect(again.map((result) => result.joined)).toEqual([true]);
  });

  it("starts nothing for a payload its when excludes", async () => {
    await seed();

    expect(await outside().startLines({ name: OPENED, payload: { ...PR_OPENED, draft: true } })).toEqual([]);
  });

  it("starts nothing once a newer version of the line drops the event", async () => {
    await seed();
    await definitions().put("line", "merge", { ...MERGE_LINE, start: undefined });

    expect(await outside().startLines({ name: OPENED, payload: PR_OPENED })).toEqual([]);
  });

  it("refuses, naming the line, when the payload lacks a field the mapping names", async () => {
    await seed();

    await expect(outside().startLines({ name: OPENED, payload: { draft: false } })).rejects.toThrow(/line "merge": a template names/);
  });

  it("starts a line on another line's settling, in that run's repo", async () => {
    await seed();
    const settled = { runId: "r-1", lineId: "merge", repo: "github.com/re-cinq/lore", outcome: "success" };

    const started = await outside().startLines({ name: "internal.run.settled", payload: settled });

    expect(started.map((result) => result.run)).toMatchObject([{ lineId: "notify", repo: "github.com/re-cinq/lore" }]);
  });

  it("never starts a line on the settling of its own run", async () => {
    await seed();
    const settled = { runId: "r-1", lineId: "notify", repo: "github.com/re-cinq/lore", outcome: "success" };

    expect(await outside().startLines({ name: "internal.run.settled", payload: settled })).toEqual([]);
  });
});

describe("OutsideEvents.runFor", () => {
  it("finds the open run holding a subject on a repo", async () => {
    const run = await waitingOnMerge();

    const found = await outside().runFor(SUBJECT);

    expect(found?.id).toBe(run.id);
  });

  it("finds nothing for a subject no open run holds", async () => {
    await seed();

    expect(await outside().runFor(SUBJECT)).toBeNull();
  });
});

describe("OutsideEvents.answer", () => {
  it("writes the outcome on the waiting node's open visit", async () => {
    const run = await waitingOnMerge();

    const reported = await outside().answer(run, { name: CLOSED, payload: { merged: true } });

    expect(reported).toMatchObject([{ nodeId: "merged", report: { outcome: "success" }, worker: `event:${CLOSED}` }]);
  });

  it("moves the run on: the walk settles it", async () => {
    const run = await waitingOnMerge();

    await outside().answer(run, { name: CLOSED, payload: { merged: true } });
    const settled = await store().get(run.id);

    expect(settled!.outcome).toBe("success");
  });

  it("writes nothing when the payload does not satisfy the node's when", async () => {
    const run = await waitingOnMerge();

    expect(await outside().answer(run, { name: CLOSED, payload: { merged: false } })).toEqual([]);
  });

  it("writes nothing on a redelivery, the visit being already reported", async () => {
    const run = await waitingOnMerge();

    await outside().answer(run, { name: CLOSED, payload: { merged: true } });

    expect(await outside().answer(run, { name: CLOSED, payload: { merged: true } })).toEqual([]);
  });
});
