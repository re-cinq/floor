// Shared Postgres-backed fixture for the AssemblyRunStore test files, so the pool lifecycle and the review line never drift into two copies.
import { afterAll, beforeAll, beforeEach } from "vitest";
import type { PgPool } from "./pg.js";
import { openTestPool } from "./test-database.js";
import { AssemblyRunStore } from "./assembly-run-store.js";
import { DefinitionsStore } from "./definitions.js";
import { EventStore } from "./events.js";
import type { AgentDefinitionBody, Item, LineBody, StationBody } from "./types.js";

export const FIXED_NOW = new Date("2026-01-01T00:00:00Z");

export const REVIEW_LINE: LineBody = {
  entry: "review",
  exit: "done",
  args: { repo: { kind: "git" }, pr_url: { kind: "value", subject: true } },
  nodes: [
    { id: "review", station: "review", bind: { workspace: "repo" } },
    { id: "retrospective" },
    { id: "done" },
  ],
  edges: [
    { from: "review", to: "retrospective", on: "success" },
    { from: "review", to: "retrospective", on: "changes_requested" },
    { from: "review", to: "review", on: "failed", iterationMax: 1 },
    { from: "retrospective", to: "done", on: "always" },
  ],
};

export const REVIEW_STATION: StationBody = {
  kind: "agent",
  agentDefinition: "reviewer",
  outcomes: ["success", "changes_requested", "failed"],
  needs: [
    { name: "workspace", kind: "git" },
    { name: "pr_url", kind: "value" },
  ],
  produces: [
    { name: "review_verdict", kind: "value" },
    { name: "review_findings", kind: "file" },
  ],
};

export const REVIEWER_AGENT_DEFINITION: AgentDefinitionBody = {
  settings: { prompt: "Review {pr_url}.", image: "img:1", timeoutMinutes: 20 },
};

export function startItems(): Record<string, Item> {
  return {
    repo: { kind: "git", ref: "github.com/re-cinq/lore@main", by: "start", sha: "9e1f" },
    pr_url: { kind: "value", ref: "https://github.com/re-cinq/lore/pull/412", by: "start" },
  };
}

export interface RetrospectiveOpened {
  runId: string;
  opened: Awaited<ReturnType<AssemblyRunStore["openVisit"]>>;
  run: Awaited<ReturnType<AssemblyRunStore["get"]>>;
  runEvents: string[];
}

export interface StoreFixture {
  pool: () => PgPool;
  store: () => AssemblyRunStore;
  definitions: () => DefinitionsStore;
  events: () => EventStore;
  seedReviewLine: () => Promise<void>;
  openEntryVisit: () => Promise<{ runId: string; visitId: string }>;
  reviewSucceedsIntoRetrospective: () => Promise<RetrospectiveOpened>;
}

export function setupStoreFixture(): StoreFixture {
  const pool = registerPoolLifecycle();
  const store = (): AssemblyRunStore => new AssemblyRunStore({ pool: pool(), now: () => FIXED_NOW });
  const definitions = (): DefinitionsStore => new DefinitionsStore({ connection: pool() });
  const events = (): EventStore => new EventStore({ connection: pool(), now: () => FIXED_NOW });

  const seedReviewLine = async (): Promise<void> => {
    await definitions().put("line", "code-review", REVIEW_LINE);
    await definitions().put("station", "review", REVIEW_STATION);
    await definitions().put("agent_definition", "reviewer", REVIEWER_AGENT_DEFINITION);
  };

  return { pool, store, definitions, events, seedReviewLine, ...buildScenarios(store, events, seedReviewLine) };
}

function registerPoolLifecycle(): () => PgPool {
  let pool: PgPool;

  beforeAll(async () => {
    pool = await openTestPool();
  });

  beforeEach(async () => {
    await pool.query("truncate definitions, assembly_runs, station_runs, events restart identity cascade");
  });

  afterAll(async () => {
    await pool.end();
  });

  return () => pool;
}

function buildScenarios(
  store: () => AssemblyRunStore,
  events: () => EventStore,
  seedReviewLine: () => Promise<void>,
): Pick<StoreFixture, "openEntryVisit" | "reviewSucceedsIntoRetrospective"> {
  const openEntryVisit = async (): Promise<{ runId: string; visitId: string }> => {
    await seedReviewLine();
    const { run } = await store().start({ lineId: "code-review", repo: "github.com/re-cinq/lore", startItems: startItems() });
    const { visit } = await store().openVisit(run.id, "review", 1);

    return { runId: run.id, visitId: visit.id };
  };

  const reviewSucceedsIntoRetrospective = async (): Promise<RetrospectiveOpened> => {
    const { runId, visitId } = await openEntryVisit();

    await store().report(visitId, { outcome: "success" });
    const opened = await store().openVisit(runId, "retrospective", 1);
    const run = await store().get(runId);
    const runEvents = (await events().listByRun(runId)).map((event) => event.name);

    return { runId, opened, run, runEvents };
  };

  return { openEntryVisit, reviewSucceedsIntoRetrospective };
}
