// What a machine needs to run one visit (docs/entities/station.md, "agent"): the frozen brief again, but structured, since a Kubernetes manifest wants each need's kind, path and access, not its text.
import { gitRefOf } from "./repo-name.js";
import type { Pool } from "pg";
import type { AssemblyRunStore } from "./assembly-run-store.js";
import type { DefinitionsStore } from "./definitions.js";
import { enforce } from "./refusal.js";
import type { BriefNeed } from "@re-cinq/floor-contracts";
import type { AgentSettings, Item, LineBody, NeedSpec, ProduceSpec, Run, StationBody, Visit } from "./types.js";

export type DispatchNeed = BriefNeed;

/** `visitId` names the earlier visit whose conversation this one continues: the id the subsystem resumes, and fetches the archive by. `save` is for the first round of a station that continues: nothing to restore yet, but the next round will want this one. */
export type DispatchConversation = { mode: "new"; save: boolean } | { mode: "continue"; visitId: string };

export interface DispatchBrief {
  visit: Visit;
  lineId: string;
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
  const { repo, branch = "HEAD" } = gitRefOf(held.ref);

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
    const run = await this.deps.runs.get(visit.runId);

    enforce(run, `run "${visit.runId}" is gone`);
    const [bind, bag, conversation] = await Promise.all([this.bindOf(visit, run), this.deps.runs.bagOf(run), this.conversationOf(visit, station.body)]);
    const needs = dispatchNeeds({ station: station.body, bind, bag, frozen: visit.brief.needs, baseUrl });

    return { visit, lineId: run.lineId, station: station.body, settings: visit.agentSettings, needs, produces: station.body.produces, conversation };
  }

  private async bindOf(visit: Visit, run: Run): Promise<Record<string, string> | undefined> {
    const line = await this.deps.definitions.byHash<LineBody>("line", run.lineId, run.lineHash);
    const nodes = line?.body.nodes ?? [];

    return nodes.find((node) => node.id === visit.nodeId)?.bind;
  }

  private async conversationOf(visit: Visit, station: StationBody): Promise<DispatchConversation> {
    const earlier = visit.resumedFrom ? await this.visitSavedAs(visit.resumedFrom) : null;

    return earlier ? { mode: "continue", visitId: earlier } : { mode: "new", save: station.conversation === "continue" };
  }

  /** The visit whose report carries this conversation archive. */
  async visitSavedAs(sessionRef: string): Promise<string | null> {
    const { rows } = await this.deps.pool.query(`select station_run_id from station_runs where session_ref = $1 order by id desc limit 1`, [sessionRef]);

    return rows[0]?.station_run_id ?? null;
  }
}
