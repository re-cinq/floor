// The one object through which a run's state is read and changed. See docs/assembly_run_storage.md, "The store", and README.md for what this file does and does not implement yet.

import type { Pool, PoolClient } from "pg";
import { getNextTransition, type Transition } from "@floor/assembly-lines";
import { DefinitionsStore } from "./definitions.js";
import { EventStore } from "./events.js";
import { buildWalkGraph } from "./walk-graph.js";
import { foldBag } from "./bag.js";
import { deriveSubjectKey } from "./resolve.js";
import { Refusal, enforce } from "./refusal.js";
import { nodeStartedBy, requireNode, startEventName } from "./start-events.js";
import { OpenVisitResolver, type OpenContext } from "./open-visit.js";
import { getWith, toNodeVisit, toRun, toVisit, visitsWith, withTransaction, type Queryable } from "./rows.js";
import {
  closeOpenHumanVisits,
  insertRun,
  insertVisit,
  listQuery,
  nodeVisitCount,
  openRunBySubject,
  openVisitRows,
  overdueVisitRows,
  settleRun,
  writeReport,
} from "./sql.js";
import type { Item, LineBody, LineNode, Report, Run, Visit } from "./types.js";

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

    enforce(line, `no line named "${input.lineId}"`);
    const entry = requireNode(line.body, input.entry ?? line.body.entry);
    const subjectKey = deriveSubjectKey(line.body, input.startItems);

    return withTransaction(this.deps.pool, (client) =>
      this.startInTransaction(client, { input, lineHash: line.hash, entry, subjectKey }),
    );
  }

  private async startInTransaction(client: PoolClient, prepared: PreparedStart): Promise<StartResult> {
    const inserted = await insertRun(client, prepared.input, prepared.lineHash, prepared.subjectKey);

    if (inserted) {
      await this.announceStart(client, inserted, prepared.entry);

      return { run: inserted, joined: false };
    }

    const existing = await openRunBySubject(client, prepared.input.repo, prepared.subjectKey!);

    return { run: existing!, joined: true };
  }

  private async announceStart(client: PoolClient, run: Run, entry: LineNode): Promise<void> {
    const events = this.eventsOn(client);

    await events.enqueue({ name: "internal.run.started", payload: aboutRun(run), runId: run.id });
    await events.enqueue({ name: startEventName(entry), payload: { runId: run.id, nodeId: entry.id, iteration: 1 }, runId: run.id });
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
    return withTransaction(this.deps.pool, (client) => this.stopInTransaction(client, { runId, outcome: "cancelled", reason }));
  }

  /** Ends a run that cannot go on (a node that can never open, for instance), the same way cancel does but as `error`. */
  async fail(runId: string, reason: string): Promise<Run> {
    return withTransaction(this.deps.pool, (client) => this.stopInTransaction(client, { runId, outcome: "error", reason }));
  }

  private async stopInTransaction(client: PoolClient, stop: { runId: string; outcome: string; reason: string }): Promise<Run> {
    const run = await settleRun(client, { ...stop, now: this.now() });
    const events = this.eventsOn(client);

    await events.dropQueued(stop.runId);
    await this.abortOpenVisits(client, events, stop.runId);
    await events.enqueue({ name: "internal.run.settled", payload: aboutRun(run), runId: run.id });

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

    enforce(run, `no run "${runId}"`);
    const visits = await this.visits(runId);

    return foldBag(this.definitions, run.startItems, visits);
  }

  async next(runId: string): Promise<Transition> {
    const { transition } = await this.walkWith(this.deps.pool, runId);

    return transition;
  }

  private async lineOf(connection: Queryable, runId: string): Promise<{ run: Run; line: LineBody }> {
    const run = await getWith(connection, runId);

    enforce(run, `no run "${runId}"`);
    const line = await this.definitions.byHash<LineBody>("line", run.lineId, run.lineHash);

    enforce(line, `line "${run.lineId}"@${run.lineHash} is gone`);

    return { run, line: line.body };
  }

  private async walkWith(connection: Queryable, runId: string): Promise<{ run: Run; line: LineBody; transition: Transition }> {
    const { run, line } = await this.lineOf(connection, runId);
    const graph = await buildWalkGraph(this.definitions, run.lineId, line);
    const visits = (await visitsWith(connection, runId)).map(toNodeVisit);

    return { run, line, transition: getNextTransition(graph, visits) };
  }

  /** The node this event starts in this run's line, by its own start name or the default `node.<id>.start`; null when the event starts no node here. */
  async nodeStartedBy(runId: string, eventName: string): Promise<string | null> {
    const { line } = await this.lineOf(this.deps.pool, runId);

    return nodeStartedBy(line, eventName)?.id ?? null;
  }

  async settle(runId: string): Promise<Run> {
    const transition = await this.next(runId);
    const settle = settleInputFor(runId, transition, this.now());

    return withTransaction(this.deps.pool, async (client) => {
      const settled = await settleRun(client, settle);

      await this.eventsOn(client).enqueue({ name: "internal.run.settled", payload: aboutRun(settled), runId });

      return settled;
    });
  }

  async openVisit(runId: string, nodeId: string, iteration: number, requestedBy?: string): Promise<OpenVisitResult> {
    const { run, line } = await this.lineOf(this.deps.pool, runId);

    enforce(!run.finishedAt, `run "${runId}" is already finished`);
    const context = await this.openVisitResolver.resolve({ run, line, nodeId, iteration, requestedBy });

    return withTransaction(this.deps.pool, async (client) => {
      if (requestedBy) await closeOpenHumanVisits(client, run.id, this.now());
      const inserted = await insertVisit(client, run.id, context);

      if (!inserted.created) return inserted;
      const visit = await this.dispatchOpened(client, run.id, inserted.visit, context);

      return { visit, created: true };
    });
  }

  /** A start from outside the walk: the node's already-open visit if it has one (so a redelivered start opens nothing twice), otherwise its next iteration. */
  async openVisitByHand(runId: string, nodeId: string, requestedBy: string): Promise<OpenVisitResult> {
    const { openVisit, highestIteration } = await nodeVisitCount(this.deps.pool, runId, nodeId);

    if (openVisit) return { visit: openVisit, created: false };

    return this.openVisit(runId, nodeId, highestIteration + 1, requestedBy);
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
    const { run, line, transition } = await this.walkWith(client, runId);
    const events = this.eventsOn(client);

    if (run.finishedAt) return;

    if (transition.kind === "launch") {
      await events.enqueue({
        name: startEventName(requireNode(line, transition.nodeId)),
        payload: { runId, nodeId: transition.nodeId, iteration: transition.iteration },
        runId,
      });

      return;
    }

    if (transition.kind === "finish" || transition.kind === "fail") {
      const settle = settleInputFor(runId, transition, this.now());

      const settled = await settleRun(client, settle);

      await events.enqueue({ name: "internal.run.settled", payload: aboutRun(settled), runId });
    }
  }

  async visits(runId: string): Promise<Visit[]> {
    return visitsWith(this.deps.pool, runId);
  }

  /** Every open visit whose deadline has passed, for a sweep to fail as a timeout. A human visit never has a deadline, so it never sweeps. */
  async overdueVisits(now: Date): Promise<Visit[]> {
    return overdueVisitRows(this.deps.pool, now);
  }

  async visit(visitId: string): Promise<Visit | null> {
    const { rows } = await this.deps.pool.query(`select * from station_runs where station_run_id = $1`, [visitId]);

    return rows[0] ? toVisit(rows[0]) : null;
  }
}

// What an internal event says about its run: enough for a line started by it to know whose run this was, and where.
function aboutRun(run: Run): Record<string, unknown> {
  return { runId: run.id, lineId: run.lineId, repo: run.repo, subjectKey: run.subjectKey, outcome: run.outcome, reason: run.reason };
}

interface PreparedStart {
  input: StartRunInput;
  lineHash: string;
  entry: LineNode;
  subjectKey: string | null;
}

function settleInputFor(runId: string, transition: Transition, now: Date): { runId: string; outcome: string; reason: string | null; now: Date } {
  if (transition.kind !== "finish" && transition.kind !== "fail") {
    throw new Refusal(`run "${runId}" is not finished`);
  }

  const outcome = transition.kind === "finish" ? "success" : transition.outcome;
  const reason = transition.kind === "fail" ? transition.reason : null;

  return { runId, outcome, reason, now };
}


