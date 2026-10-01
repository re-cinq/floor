import { describe, expect, it } from "vitest";
import { Refusal } from "./refusal.js";
import type { LineBody } from "./types.js";
import {
  FIXED_NOW,
  REVIEW_STATION,
  REVIEWER_AGENT_DEFINITION,
  setupStoreFixture,
  startItems,
} from "./assembly-run-store.fixtures.js";

const { store, definitions, events, seedReviewLine, seedDigestLine, openEntryVisit, reviewSucceedsIntoRetrospective } = setupStoreFixture();

describe("AssemblyRunStore.start", () => {
  it("writes a run referencing the line's latest version", async () => {
    await seedReviewLine();
    const line = await definitions().latest("line", "code-review");

    const { run } = await store().start({ lineId: "code-review", repo: "github.com/re-cinq/lore", startItems: startItems() });

    expect(run.lineHash).toBe(line!.hash);
  });

  it("derives the subject key from the argument marked subject", async () => {
    await seedReviewLine();

    const { run } = await store().start({ lineId: "code-review", repo: "github.com/re-cinq/lore", startItems: startItems() });

    expect(run.subjectKey).toBe("pr_url:https://github.com/re-cinq/lore/pull/412");
  });

  async function startedRunEvents(): Promise<string[]> {
    await seedReviewLine();
    const { run } = await store().start({ lineId: "code-review", repo: "github.com/re-cinq/lore", startItems: startItems() });
    const runEvents = await events().listByRun(run.id);

    return runEvents.map((event) => event.name);
  }

  it("posts the entry node's start event", async () => {
    const eventNames = await startedRunEvents();

    expect(eventNames).toContain("node.review.start");
  });

  it("posts internal.run.started", async () => {
    const eventNames = await startedRunEvents();

    expect(eventNames).toContain("internal.run.started");
  });

  it("joins the open run already holding the subject, rather than starting a second one", async () => {
    await seedReviewLine();
    const first = await store().start({ lineId: "code-review", repo: "github.com/re-cinq/lore", startItems: startItems() });

    const second = await store().start({ lineId: "code-review", repo: "github.com/re-cinq/lore", startItems: startItems() });

    expect({ id: second.run.id, joined: second.joined }).toEqual({ id: first.run.id, joined: true });
  });

  it("joins the open run holding the subject when both starts have a null repo", async () => {
    await seedDigestLine({ channel: { kind: "value", subject: true } });
    const startItemsForChannel = { channel: { kind: "value", ref: "C123", by: "start" } } as const;
    const first = await store().start({ lineId: "digest", repo: null, startItems: { ...startItemsForChannel } });

    const second = await store().start({ lineId: "digest", repo: null, startItems: { ...startItemsForChannel } });

    expect({ runId: second.run.id, joined: second.joined }).toEqual({ runId: first.run.id, joined: true });
  });

  it("starts a second run for a different subject", async () => {
    await seedReviewLine();
    await store().start({ lineId: "code-review", repo: "github.com/re-cinq/lore", startItems: startItems() });

    const other = await store().start({
      lineId: "code-review",
      repo: "github.com/re-cinq/lore",
      startItems: {
        ...startItems(),
        pr_url: { kind: "value", ref: "https://github.com/re-cinq/lore/pull/999", by: "start" },
      },
    });

    expect(other.joined).toBe(false);
  });

  it("gives a run with a null repo on a line declaring no git argument", async () => {
    await seedDigestLine();

    const { run } = await store().start({ lineId: "digest", repo: null, startItems: {} });

    expect(await store().get(run.id)).toMatchObject({ repo: null });
  });

  it("refuses a null repo on a line declaring a git argument", async () => {
    await seedReviewLine();

    await expect(
      store().start({ lineId: "code-review", repo: null, startItems: startItems() }),
    ).rejects.toThrow(new Refusal('line "code-review" has a git argument, so a start must name its repo'));
  });

  it("refuses a line that was never put", async () => {
    await expect(
      store().start({ lineId: "missing-line", repo: "r", startItems: {} }),
    ).rejects.toThrow(/no line/);
  });
});

describe("AssemblyRunStore.openVisit", () => {
  it("resolves the frozen brief from the bag", async () => {
    const { visitId } = await openEntryVisit();
    const visit = await store().visit(visitId);
    const needs = visit!.brief.needs;

    expect(needs.pr_url).toBe("https://github.com/re-cinq/lore/pull/412");
  });

  it("flattens a git need to its ref, via the node's bind", async () => {
    const { visitId } = await openEntryVisit();
    const visit = await store().visit(visitId);
    const needs = visit!.brief.needs;

    expect(needs.workspace).toBe("github.com/re-cinq/lore@main@9e1f");
  });

  it("records the resolved station hash", async () => {
    const { visitId } = await openEntryVisit();
    const station = await definitions().latest("station", "review");
    const visit = await store().visit(visitId);

    expect(visit!.stationHash).toBe(station!.hash);
  });

  it("resolves the agent definition and records its hash", async () => {
    const { visitId } = await openEntryVisit();
    const agentDef = await definitions().latest("agent_definition", "reviewer");
    const visit = await store().visit(visitId);

    expect(visit!.agentDefinitionHash).toBe(agentDef!.hash);
  });

  it("sets a deadline from queue wait plus the resolved timeout", async () => {
    const { visitId } = await openEntryVisit();
    const visit = await store().visit(visitId);

    expect(visit!.deadline?.getTime()).toBe(FIXED_NOW.getTime() + (30 + 20) * 60_000);
  });

  it("enqueues station_run.dispatch tagged for an agent worker", async () => {
    const { runId } = await openEntryVisit();
    const runEvents = await events().listByRun(runId);
    const dispatch = runEvents.find((event) => event.name === "station_run.dispatch");

    expect(dispatch?.tags).toContain("kind:agent");
  });

  it("is idempotent on (run, node, iteration): a redelivered open does not create a second visit", async () => {
    await seedReviewLine();
    const { run } = await store().start({ lineId: "code-review", repo: "github.com/re-cinq/lore", startItems: startItems() });

    const first = await store().openVisit(run.id, "review", 1);
    const second = await store().openVisit(run.id, "review", 1);

    expect({ firstCreated: first.created, secondCreated: second.created, sameId: second.visit.id === first.visit.id }).toEqual({
      firstCreated: true,
      secondCreated: false,
      sameId: true,
    });
  });

  it("refuses a required need with nothing in the bag", async () => {
    await definitions().put("line", "bad-line", {
      entry: "review",
      exit: "done",
      args: {},
      nodes: [{ id: "review", station: "review" }, { id: "done" }],
      edges: [{ from: "review", to: "done", on: "success" }],
    } satisfies LineBody);
    await definitions().put("station", "review", REVIEW_STATION);
    await definitions().put("agent_definition", "reviewer", REVIEWER_AGENT_DEFINITION);
    const { run } = await store().start({ lineId: "bad-line", repo: "r", startItems: {} });

    await expect(store().openVisit(run.id, "review", 1)).rejects.toThrow(/missing required need/);
  });

  it("resumes the conversation an earlier repo-less run saved under the same key value", async () => {
    await definitions().put("line", "digest", {
      entry: "post",
      exit: "done",
      args: { channel: { kind: "value" } },
      nodes: [{ id: "post", station: "poster" }, { id: "done" }],
      edges: [{ from: "post", to: "done", on: "success" }],
    } satisfies LineBody);
    await definitions().put("station", "poster", {
      kind: "agent",
      agentDefinition: "reviewer",
      conversation: "continue",
      conversationKey: "channel",
      outcomes: ["success"],
      needs: [{ name: "channel", kind: "value" }],
      produces: [],
    });
    await definitions().put("agent_definition", "reviewer", REVIEWER_AGENT_DEFINITION);
    const channel = { channel: { kind: "value", ref: "C123", by: "start" } } as const;
    const earlier = await store().start({ lineId: "digest", repo: null, startItems: { ...channel } });
    const earlierVisit = await store().openVisit(earlier.run.id, "post", 1);
    await store().report(earlierVisit.visit.id, { outcome: "success", sessionRef: "sha256-archive" });
    const later = await store().start({ lineId: "digest", repo: null, startItems: { ...channel } });

    const laterVisit = await store().openVisit(later.run.id, "post", 1);

    expect(laterVisit.visit).toMatchObject({ resumedFrom: "sha256-archive" });
  });

  it("opens a marker node and reports success in the same step, without anyone reporting on it", async () => {
    const { opened } = await reviewSucceedsIntoRetrospective();

    expect(opened.visit.report).toEqual({ outcome: "success" });
  });

  it("settles the run as a side effect of a marker's edge reaching the exit, with no visit of the exit itself", async () => {
    const { run } = await reviewSucceedsIntoRetrospective();

    expect(run!.outcome).toBe("success");
  });
});
