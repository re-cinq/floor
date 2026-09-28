// The one object through which a run's state is read and changed. See docs/assembly_run_storage.md, "The store", and README.md for what this file does and does not implement yet.

import type { Pool, PoolClient } from "pg";
import { getNextTransition, type Transition } from "@floor/assembly-lines";
import { DefinitionsStore } from "./definitions.js";
import { EventStore } from "./events.js";
import { buildWalkGraph } from "./walk-graph.js";
import { foldBag } from "./bag.js";
import { deriveSubjectKey } from "./resolve.js";
import { OpenVisitResolver, type OpenContext } from "./open-visit.js";
import { getWith, toNodeVisit, toRun, toVisit, visitsWith, withTransaction, type Queryable } from "./rows.js";
import {
  insertRun,
  insertVisit,
  listQuery,
  openRunBySubject,
  openVisitRows,
  settleRun,
  writeReport,
} from "./sql.js";
import type { Item, LineBody, Report, Run, Visit } from "./types.js";

export interface StartRunInput {
  lineId: string;
  repo: string;
  startItems: Record<string, Item>;
  /** Starts at a node other than the line's entry; the node must exist. */
  entry?: string;
}

export interface StartResult {
  run: Run;
  joined: boolean;
}

export interface OpenVisitResult {
  visit: Visit;
  created: boolean;
}

export interface RunFilter {
  lineId?: string;
  repo?: string;
  subjectKey?: string;
  open?: boolean;
}

export interface Page {
  limit: number;
  cursor?: string;
}

export interface PageOf<T> {
  items: T[];
  nextCursor: string | null;
}

export interface AssemblyRunStoreDeps {
  pool: Pool;
  now?: () => Date;
}

export class AssemblyRunStore {
  private readonly definitions: DefinitionsStore;
  private readonly openVisitResolver: OpenVisitResolver;

  constructor(private readonly deps: AssemblyRunStoreDeps) {
    this.definitions = new DefinitionsStore({ connection: deps.pool });
    this.openVisitResolver = new OpenVisitResolver({
      pool: deps.pool,
      definitions: this.definitions,
      now: this.now.bind(this),
      bag: this.bag.bind(this),
    });
  }

  private now(): Date {
    return this.deps.now?.() ?? new Date();
  }

  private eventsOn(connection: Queryable): EventStore {
    return new EventStore({ connection, now: this.deps.now });
  }

  async start(input: StartRunInput): Promise<StartResult> {
    const line = await this.definitions.latest<LineBody>("line", input.lineId);

    if (!line) throw new Error(`no line named "${input.lineId}"`);
    const entry = input.entry ?? line.body.entry;

    requireNode(line.body, entry);
    const subjectKey = deriveSubjectKey(line.body, input.startItems);

    return withTransaction(this.deps.pool, (client) =>
      this.startInTransaction(client, { input, lineHash: line.hash, entry, subjectKey }),
    );
  }

  private async startInTransaction(client: PoolClient, prepared: PreparedStart): Promise<StartResult> {
    const inserted = await insertRun(client, prepared.input, prepared.lineHash, prepared.subjectKey);

    if (inserted) {
      await this.announceStart(client, inserted.id, prepared.entry);

      return { run: inserted, joined: false };
    }

    const existing = await openRunBySubject(client, prepared.input.repo, prepared.subjectKey!);

    return { run: existing!, joined: true };
  }

  private async announceStart(client: PoolClient, runId: string, entry: string): Promise<void> {
    const events = this.eventsOn(client);

    await events.enqueue({ name: "internal.run.started", payload: { runId }, runId });
    await events.enqueue({ name: `node.${entry}.start`, payload: { runId, nodeId: entry }, runId });
  }

  async get(runId: string): Promise<Run | null> {
    return getWith(this.deps.pool, runId);
  }

  async list(filter: RunFilter, page: Page): Promise<PageOf<Run>> {
    const { text, values } = listQuery(filter, page);
    const { rows } = await this.deps.pool.query(text, values);
    const runs = rows.map((row) => toRun(row));

    return { items: runs, nextCursor: rows.length === page.limit ? String(runs.at(-1)?.id) : null };
  }

  async cancel(runId: string, reason: string): Promise<Run> {
    return withTransaction(this.deps.pool, (client) => this.cancelInTransaction(client, runId, reason));
  }

  private async cancelInTransaction(client: PoolClient, runId: string, reason: string): Promise<Run> {
    const run = await settleRun(client, { runId, outcome: "cancelled", reason, now: this.now() });
    const events = this.eventsOn(client);

    await events.dropQueued(runId);
    await this.abortOpenVisits(client, events, runId);

    return run;
  }

  private async abortOpenVisits(client: PoolClient, events: EventStore, runId: string): Promise<void> {
    const openVisits = await openVisitRows(client, runId);

    for (const visit of openVisits) {
      await events.enqueue({
        name: "station_run.abort",
        payload: { visitId: visit.stationRunId },
        tags: visit.dispatchTags,
        runId,
      });
    }
  }

  async bag(runId: string): Promise<Record<string, Item>> {
    const run = await this.get(runId);

    if (!run) throw new Error(`no run "${runId}"`);
    const visits = await this.visits(runId);

    return foldBag(this.definitions, run.startItems, visits);
  }

  async next(runId: string): Promise<Transition> {
    return this.nextWith(this.deps.pool, runId);
  }

  private async nextWith(connection: Queryable, runId: string): Promise<Transition> {
    const run = await getWith(connection, runId);

    if (!run) throw new Error(`no run "${runId}"`);
    const line = await this.definitions.byHash<LineBody>("line", run.lineId, run.lineHash);

    if (!line) throw new Error(`line "${run.lineId}"@${run.lineHash} is gone`);
    const graph = await buildWalkGraph(this.definitions, run.lineId, line.body);
    const visits = (await visitsWith(connection, runId)).map(toNodeVisit);

    return getNextTransition(graph, visits);
  }

  async settle(runId: string): Promise<Run> {
    const transition = await this.next(runId);
    const settle = settleInputFor(runId, transition, this.now());

    return withTransaction(this.deps.pool, async (client) => {
      const settled = await settleRun(client, settle);

      await this.eventsOn(client).enqueue({
        name: "internal.run.settled",
        payload: { runId, outcome: settle.outcome },
        runId,
      });

      return settled;
    });
  }

  async openVisit(runId: string, nodeId: string, iteration: number, requestedBy?: string): Promise<OpenVisitResult> {
    const run = await this.get(runId);

    if (!run) throw new Error(`no run "${runId}"`);
    if (run.finishedAt) throw new Error(`run "${runId}" is already finished`);
    const line = await this.definitions.byHash<LineBody>("line", run.lineId, run.lineHash);

    if (!line) throw new Error(`line "${run.lineId}"@${run.lineHash} is gone`);
    const context = await this.openVisitResolver.resolve({ run, line: line.body, nodeId, iteration, requestedBy });

    return withTransaction(this.deps.pool, async (client) => {
      const inserted = await insertVisit(client, run.id, context);

      if (!inserted.created) return inserted;
      const visit = await this.dispatchOpened(client, run.id, inserted.visit, context);

      return { visit, created: true };
    });
  }

  private async dispatchOpened(client: PoolClient, runId: string, visit: Visit, context: OpenContext): Promise<Visit> {
    if (!context.stationHash) return this.reportInClient(client, visit.id, { outcome: "success" });

    if (context.dispatchTags.length > 0) {
      await this.eventsOn(client).enqueue({
        name: "station_run.dispatch",
        payload: { visitId: visit.id },
        tags: context.dispatchTags,
        runId,
      });
    }

    return visit;
  }

  async report(visitId: string, report: Report, worker?: string): Promise<Visit> {
    return withTransaction(this.deps.pool, (client) => this.reportInClient(client, visitId, report, worker));
  }

  private async reportInClient(client: PoolClient, visitId: string, report: Report, worker?: string): Promise<Visit> {
    const visit = await writeReport(client, { visitId, report, worker, now: this.now() });

    await this.advance(client, visit.runId);

    return visit;
  }

  private async advance(client: PoolClient, runId: string): Promise<void> {
    const transition = await this.nextWith(client, runId);
    const events = this.eventsOn(client);

    if (transition.kind === "launch") {
      await events.enqueue({
        name: `node.${transition.nodeId}.start`,
        payload: { runId, nodeId: transition.nodeId, iteration: transition.iteration },
        runId,
      });

      return;
    }

    if (transition.kind === "finish" || transition.kind === "fail") {
      const settle = settleInputFor(runId, transition, this.now());

      await settleRun(client, settle);
      await events.enqueue({ name: "internal.run.settled", payload: { runId, outcome: settle.outcome }, runId });
    }
  }

  async visits(runId: string): Promise<Visit[]> {
    return visitsWith(this.deps.pool, runId);
  }

  async visit(visitId: string): Promise<Visit | null> {
    const { rows } = await this.deps.pool.query(`select * from station_runs where station_run_id = $1`, [visitId]);

    return rows[0] ? toVisit(rows[0]) : null;
  }
}

interface PreparedStart {
  input: StartRunInput;
  lineHash: string;
  entry: string;
  subjectKey: string | null;
}

function settleInputFor(runId: string, transition: Transition, now: Date): { runId: string; outcome: string; reason: string | null; now: Date } {
  if (transition.kind !== "finish" && transition.kind !== "fail") {
    throw new Error(`run "${runId}" is not finished`);
  }

  const outcome = transition.kind === "finish" ? "success" : transition.outcome;
  const reason = transition.kind === "fail" ? transition.reason : null;

  return { runId, outcome, reason, now };
}

function requireNode(line: LineBody, nodeId: string): LineBody["nodes"][number] {
  const node = line.nodes.find((candidate) => candidate.id === nodeId);

  if (!node) throw new Error(`no node "${nodeId}" in this line`);

  return node;
}

