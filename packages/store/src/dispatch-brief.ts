// What a machine needs to run one visit (docs/entities/station.md, "agent"): the frozen brief again, but structured, since a Kubernetes manifest wants each need's kind, path and access, not its text.
import type { Pool } from "pg";
import type { AssemblyRunStore } from "./assembly-run-store.js";
import type { DefinitionsStore } from "./definitions.js";
import { enforce } from "./refusal.js";
import type { AgentSettings, Item, LineBody, NeedSpec, ProduceSpec, StationBody, Visit } from "./types.js";

export type DispatchNeed =
  | { name: string; kind: "value"; value: string }
  | { name: string; kind: "file"; path: string; url: string }
  | { name: string; kind: "git"; path: string; repoUrl: string; ref: string; access: "read" | "write" };

/** `visitId` names the earlier visit whose conversation this one continues: the id the subsystem resumes, and fetches the archive by. */
export type DispatchConversation = { mode: "new" } | { mode: "continue"; visitId: string };

export interface DispatchBrief {
  visit: Visit;
  station: StationBody;
  settings: AgentSettings | null;
  needs: DispatchNeed[];
  produces: ProduceSpec[];
  conversation: DispatchConversation;
}

export interface NeedSources {
  station: StationBody;
  bind: Record<string, string> | undefined;
  bag: Record<string, Item>;
  /** The visit's frozen needs: every value the visit was promised, the built-in ones included. */
  frozen: Record<string, string>;
  baseUrl: string;
}

export function dispatchNeeds(sources: NeedSources): DispatchNeed[] {
  const declared = sources.station.needs;
  const placed = declared.filter((spec) => spec.kind !== "value");
  const placedNames = new Set(placed.map((spec) => spec.name));
  const values = Object.entries(sources.frozen).filter(([name]) => !placedNames.has(name));

  return [
    ...values.map(([name, value]): DispatchNeed => ({ name, kind: "value", value })),
    ...placed.flatMap((spec) => placedNeed(spec, sources)),
  ];
}

// A file or a git need lands somewhere in the workspace; an optional one the bag does not hold lands nowhere.
function placedNeed(spec: NeedSpec, sources: NeedSources): DispatchNeed[] {
  const held = heldFor(spec, sources);

  return held ? [placedAt(spec.path ?? spec.name, spec, { held, baseUrl: sources.baseUrl })] : [];
}

function heldFor(spec: NeedSpec, sources: NeedSources): Item | undefined {
  const bag = sources.bag as Partial<Record<string, Item>>;

  return bag[sources.bind?.[spec.name] ?? spec.name];
}

function placedAt(path: string, spec: NeedSpec, source: { held: Item; baseUrl: string }): DispatchNeed {
  if (spec.kind === "file") return { name: spec.name, kind: "file", path, url: `${source.baseUrl}/blobs/${source.held.ref}` };

  return { name: spec.name, kind: "git", path, ...cloneOf(source.held), access: spec.access ?? "read" };
}

// A git item's ref is "host/owner/name@branch"; the sha, when the item carries one, is what the visit was promised.
function cloneOf(held: Item): { repoUrl: string; ref: string } {
  const split = held.ref.lastIndexOf("@");
  const repo = split < 0 ? held.ref : held.ref.slice(0, split);
  const branch = split < 0 ? "HEAD" : held.ref.slice(split + 1);

  return { repoUrl: `https://${repo}`, ref: held.sha ?? branch };
}

export interface DispatchBriefsDeps {
  pool: Pool;
  runs: AssemblyRunStore;
  definitions: DefinitionsStore;
}

export class DispatchBriefs {
  constructor(private readonly deps: DispatchBriefsDeps) {}

  /** Null for a visit that does not exist, or one with no station to run: a marker is never dispatched. */
  async briefFor(visitId: string, baseUrl: string): Promise<DispatchBrief | null> {
    const visit = await this.deps.runs.visit(visitId);

    if (!visit?.stationHash) return null;
    const station = await this.deps.definitions.byHashOnly<StationBody>("station", visit.stationHash);

    enforce(station, `station "${visit.stationHash}" is gone`);
    const needs = dispatchNeeds({ station: station.body, bind: await this.bindOf(visit), bag: await this.deps.runs.bag(visit.runId), frozen: visit.brief.needs, baseUrl });

    return { visit, station: station.body, settings: visit.agentSettings, needs, produces: station.body.produces, conversation: await this.conversationOf(visit) };
  }

  private async bindOf(visit: Visit): Promise<Record<string, string> | undefined> {
    const run = await this.deps.runs.get(visit.runId);
    const line = run ? await this.deps.definitions.byHash<LineBody>("line", run.lineId, run.lineHash) : null;

    const nodes = line?.body.nodes ?? [];

    return nodes.find((node) => node.id === visit.nodeId)?.bind;
  }

  private async conversationOf(visit: Visit): Promise<DispatchConversation> {
    if (!visit.resumedFrom) return { mode: "new" };
    const earlier = await this.visitSavedAs(visit.resumedFrom);

    return earlier ? { mode: "continue", visitId: earlier } : { mode: "new" };
  }

  /** The visit whose report carries this conversation archive. */
  async visitSavedAs(sessionRef: string): Promise<string | null> {
    const { rows } = await this.deps.pool.query(`select station_run_id from station_runs where session_ref = $1 order by id desc limit 1`, [sessionRef]);

    return rows[0]?.station_run_id ?? null;
  }
}
