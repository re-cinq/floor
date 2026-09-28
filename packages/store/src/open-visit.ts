// Resolution at open (docs/assembly_run_storage.md, "Resolution at open"): station, agent definition and variant, needs from the bag, conversation, failure context, deadline.

import type { Pool } from "pg";
import { DefinitionsStore } from "./definitions.js";
import type { Queryable } from "./rows.js";
import { mergeAgentSettings, previousErrorNeed, previousFailuresNeed, resolveNeeds } from "./resolve.js";
import type {
  AgentDefinitionBody,
  AgentSettings,
  Brief,
  Item,
  LineBody,
  LineNode,
  Run,
  StationBody,
} from "./types.js";

const QUEUE_WAIT_MINUTES = 30;
const DEFAULT_SERVICE_TIMEOUT_MINUTES = 30;
const MS_PER_MINUTE = 60_000;

export interface OpenRequest {
  run: Run;
  line: LineBody;
  nodeId: string;
  iteration: number;
  requestedBy?: string;
}

export interface OpenContext {
  nodeId: string;
  iteration: number;
  requestedBy: string | null;
  stationHash: string | null;
  agentDefinitionHash: string | null;
  brief: Brief;
  agentSettings: AgentSettings | null;
  resumedFrom: string | null;
  deadline: Date | null;
  dispatchTags: string[];
}

export interface OpenVisitDeps {
  pool: Pool;
  definitions: DefinitionsStore;
  now: () => Date;
  /** The same fold the store's own `bag()` exposes; injected so there is exactly one implementation of it. */
  bag(runId: string): Promise<Record<string, Item>>;
}

export class OpenVisitResolver {
  constructor(private readonly deps: OpenVisitDeps) {}

  async resolve(request: OpenRequest): Promise<OpenContext> {
    const node = requireNode(request.line, request.nodeId);

    if (!node.station) return markerContext(request);

    return this.resolveStationOpen(request, node);
  }

  private async resolveStationOpen(request: OpenRequest, node: LineNode): Promise<OpenContext> {
    const station = await this.stationRef(node.station!);
    const bag = await this.deps.bag(request.run.id);
    const { needs: resolvedNeeds, missing } = resolveNeeds(station.body.needs, node.bind, bag);

    if (missing.length > 0) {
      throw new Error(`node "${node.id}": missing required need(s) ${missing.join(", ")}`);
    }

    return this.finishStationContext(request, station, resolvedNeeds);
  }

  private async finishStationContext(
    request: OpenRequest,
    station: { hash: string; body: StationBody },
    resolvedNeeds: Record<string, string>,
  ): Promise<OpenContext> {
    const { run, nodeId, iteration } = request;
    const settings = await this.resolveAgentSettings(station.body, run.repo);
    const fields = settingsFields(settings);

    if (settings) await this.injectFailureContext(run.id, nodeId, resolvedNeeds);
    const resumedFrom = await this.resolveConversation(run, nodeId, station.body);

    return {
      nodeId,
      iteration,
      requestedBy: request.requestedBy ?? null,
      stationHash: station.hash,
      agentDefinitionHash: fields.hash,
      brief: { needs: resolvedNeeds, iteration },
      agentSettings: fields.body,
      resumedFrom,
      deadline: deadlineFor(station.body.kind, settings, this.deps.now()),
      dispatchTags: dispatchTagsFor(station.body, settings),
    };
  }

  private async stationRef(ref: string): Promise<{ hash: string; body: StationBody }> {
    const [id, hash] = ref.split("@");
    const row = hash
      ? await this.deps.definitions.byHash<StationBody>("station", id!, hash)
      : await this.deps.definitions.latest<StationBody>("station", id!);

    if (!row) throw new Error(`no station "${ref}"`);

    return { hash: row.hash, body: row.body };
  }

  private async resolveAgentSettings(
    station: StationBody,
    repo: string,
  ): Promise<{ hash: string; body: AgentSettings } | null> {
    if (station.kind !== "agent") return null;
    if (!station.agentDefinition) throw new Error(`agent station has no agent_definition`);
    const row = await this.deps.definitions.latest<AgentDefinitionBody>("agent_definition", station.agentDefinition);

    if (!row) throw new Error(`no agent definition "${station.agentDefinition}"`);
    const variants = row.body.variants;
    const merged = mergeAgentSettings(row.body.settings, variants?.[repo]);

    return { hash: row.hash, body: merged };
  }

  private async injectFailureContext(runId: string, nodeId: string, needs: Record<string, string>): Promise<void> {
    const priorErrors = await priorErrorsOf(this.deps.pool, runId, nodeId);
    const previousError = previousErrorNeed(priorErrors[0]);
    const previousFailures = previousFailuresNeed(priorErrors);

    if (previousError !== undefined) needs.previous_error = previousError;
    if (previousFailures !== undefined) needs.previous_failures = previousFailures;
  }

  private async resolveConversation(run: Run, nodeId: string, station: StationBody): Promise<string | null> {
    if (station.conversation !== "continue") return null;

    return station.conversationKey
      ? this.resolveConversationByKey(run, nodeId, station.conversationKey)
      : resolveConversationInRun(this.deps.pool, run.id, nodeId);
  }

  private async resolveConversationByKey(run: Run, nodeId: string, key: string): Promise<string | null> {
    const bag = await this.deps.bag(run.id);
    const value = bagRef(bag, key);

    if (value === undefined) return null;
    const candidates = await conversationCandidates(this.deps.pool, run.repo, nodeId);

    for (const candidate of candidates) {
      const candidateBag = await this.deps.bag(candidate.runId);

      if (bagRef(candidateBag, key) === value) return candidate.sessionRef;
    }

    return null;
  }
}

// A cast to Partial here, not the bag's own declared type: without noUncheckedIndexedAccess, `bag[key]` on a plain Record types as always-defined, which is not true of a bag a key may simply not be in.
function bagRef(bag: Record<string, Item>, key: string): string | undefined {
  const found = (bag as Partial<Record<string, Item>>)[key];

  return found?.ref;
}

async function priorErrorsOf(connection: Queryable, runId: string, nodeId: string): Promise<(string | null)[]> {
  const { rows } = await connection.query(
    `select report->>'error' as error from station_runs
     where assembly_run_id = $1 and node_id = $2 and outcome = 'failed'
     order by id desc`,
    [runId, nodeId],
  );

  return rows.map((row: { error: string | null }) => row.error);
}

async function resolveConversationInRun(connection: Queryable, runId: string, nodeId: string): Promise<string | null> {
  const { rows } = await connection.query(
    `select session_ref from station_runs
     where assembly_run_id = $1 and node_id = $2 and outcome is not null and outcome <> 'failed'
     order by id desc limit 1`,
    [runId, nodeId],
  );

  return rows[0]?.session_ref ?? null;
}

interface ConversationCandidate {
  runId: string;
  sessionRef: string;
}

async function conversationCandidates(
  connection: Queryable,
  repo: string,
  nodeId: string,
): Promise<ConversationCandidate[]> {
  const { rows } = await connection.query(
    `select s.assembly_run_id as run_id, s.session_ref
     from station_runs s join assembly_runs r on r.id = s.assembly_run_id
     where r.repo = $1 and s.node_id = $2 and s.outcome is not null and s.outcome <> 'failed'
       and s.session_ref is not null
     order by s.id desc`,
    [repo, nodeId],
  );

  return rows.map(toConversationCandidate);
}

// snake_case mirrors Postgres's own column name verbatim, a third-party shape rather than ours to rename.
/* eslint-disable @typescript-eslint/naming-convention */
function toConversationCandidate(row: { run_id: string; session_ref: string }): ConversationCandidate {
  return { runId: row.run_id, sessionRef: row.session_ref };
}
/* eslint-enable @typescript-eslint/naming-convention */

function markerContext(request: OpenRequest): OpenContext {
  return {
    nodeId: request.nodeId,
    iteration: request.iteration,
    requestedBy: request.requestedBy ?? null,
    stationHash: null,
    agentDefinitionHash: null,
    brief: { needs: {}, iteration: request.iteration },
    agentSettings: null,
    resumedFrom: null,
    deadline: null,
    dispatchTags: [],
  };
}

interface SettingsFields {
  hash: string | null;
  body: AgentSettings | null;
}

function settingsFields(settings: { hash: string; body: AgentSettings } | null): SettingsFields {
  if (!settings) return { hash: null, body: null };

  return { hash: settings.hash, body: settings.body };
}

function deadlineFor(kind: StationBody["kind"], settings: { body: AgentSettings } | null, now: Date): Date | null {
  if (kind === "human") return null;
  const timeoutMinutes = settings?.body.timeoutMinutes ?? DEFAULT_SERVICE_TIMEOUT_MINUTES;

  return new Date(now.getTime() + (QUEUE_WAIT_MINUTES + timeoutMinutes) * MS_PER_MINUTE);
}

function dispatchTagsFor(station: StationBody, settings: { body: AgentSettings } | null): string[] {
  if (station.kind === "agent") return ["kind:agent", ...(settings?.body.tags ?? [])];
  if (station.kind === "service") return [`station:${station.agentDefinition ?? ""}`];

  return [];
}

function requireNode(line: LineBody, nodeId: string): LineNode {
  const node = line.nodes.find((candidate) => candidate.id === nodeId);

  if (!node) throw new Error(`no node "${nodeId}" in this line`);

  return node;
}
