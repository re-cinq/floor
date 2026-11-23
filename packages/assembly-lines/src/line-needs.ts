// Pure: a forward must-analysis collapsed to reachability, since the bag's transfer function never drops a name once it holds one — an overwrite keeps it present. A name is missing at a node exactly when that node is reachable from an entry without passing through any producer of it, and it is not itself seeded.
import { gitArgNames } from "./line-args.js";
import { edgesByFrom, pathAvoiding, reachedFrom } from "./line-graph.js";
import { hasStation, resolvedStationOf } from "./line-stations.js";
import type { LineBody, LineNode, NeedSpec, StationBody } from "@re-cinq/floor-contracts";

/** Filled by the floor around a retry (`previous_*`) or a fan-out branch (`item`), never by a line: no station ever declares these as a need to seed or produce. */
export const EXEMPT_NEEDS: readonly string[] = ["previous_error", "previous_failures", "item"];

export interface NeedContext {
  bodies: ReadonlyMap<string, StationBody>;
  seeds: ReadonlySet<string>;
  gitSeeds: ReadonlySet<string>;
  producers: ReadonlyMap<string, string[]>;
  goingOut: ReadonlyMap<string, string[]>;
  startPoints: string[];
  customStartIds: ReadonlySet<string>;
}

export function needChecks(line: LineBody, bodies: ReadonlyMap<string, StationBody> | undefined): string[] {
  if (!bodies) return [];
  const context = coverageContextOf(line, bodies);
  const reached = reachedFrom(line);
  const stationNodes = line.nodes.filter(hasStation);
  const reachableStationNodes = stationNodes.filter((node) => reached.has(node.id));

  return reachableStationNodes.flatMap((node) => needMissesAt(node, context));
}

export function coverageContextOf(line: LineBody, bodies: ReadonlyMap<string, StationBody>): NeedContext {
  const customStartNodes = line.nodes.filter((node) => node.start);
  const customStartIds = new Set(customStartNodes.map((node) => node.id));

  return {
    bodies,
    seeds: seedNamesOf(line),
    gitSeeds: new Set(gitArgNames(line.args)),
    producers: producersOf(line, bodies),
    goingOut: edgesByFrom(line),
    startPoints: [line.entry, ...customStartIds],
    customStartIds,
  };
}

function seedNamesOf(line: LineBody): Set<string> {
  return new Set([...Object.keys(line.args), ...Object.keys(line.files ?? {})]);
}

// Every outgoing edge counts as carrying a produce, regardless of the outcome it fires on — this is about what a station's body declares, not any one path through it.
function producersOf(line: LineBody, bodies: ReadonlyMap<string, StationBody>): Map<string, string[]> {
  const byName = new Map<string, string[]>();

  for (const node of line.nodes.filter(hasStation)) {
    const body = resolvedStationOf(node, bodies);

    (body?.produces ?? []).forEach((produce) => byName.set(produce.name, [...(byName.get(produce.name) ?? []), node.id]));
  }

  return byName;
}

function needMissesAt(node: LineNode & { station: string }, context: NeedContext): string[] {
  const body = resolvedStationOf(node, context.bodies);

  return (body?.needs ?? []).flatMap((need) => needMissesOf(node, need, needCoverage(node, need, context)));
}

/** How a need at a node is covered. `filled` and `sometimes-empty` name the stations that produce it; `sometimes-empty` also gives one walk from a start point to the node that passes none of them. */
export type NeedCoverage =
  | { kind: "seeded" }
  | { kind: "filled"; producedBy: string[] }
  | { kind: "sometimes-empty"; producedBy: string[]; pathWithout: string[] }
  | { kind: "never-filled" }
  | { kind: "own-start" }
  | { kind: "git-unseeded" }
  | { kind: "optional" }
  | { kind: "floor-filled" }
  | { kind: "collected" };

export function needCoverage(node: LineNode, need: NeedSpec, context: NeedContext): NeedCoverage {
  const bagName = bagNameOf(node, need);
  const coverage = floorCoverage(need, bagName) ?? seedCoverage(node, need, bagName, context);

  return coverage ?? producedCoverage(node.id, context.producers.get(bagName) ?? [], context);
}

function floorCoverage(need: NeedSpec, bagName: string): NeedCoverage | null {
  if (need.optional) return { kind: "optional" };
  if (isExempt(bagName)) return { kind: "floor-filled" };

  // A collected need is filled from the branches of a fan-out; the fan-out checks say whether anything produces what it collects.
  return need.collect === undefined ? null : { kind: "collected" };
}

// Git first, since nothing ever produces one and the seed check below would otherwise call it "not produced on every path" — a claim that makes no sense for a kind no station can hand on.
function seedCoverage(node: LineNode, need: NeedSpec, bagName: string, context: NeedContext): NeedCoverage | null {
  if (need.kind === "git") return context.gitSeeds.has(bagName) ? { kind: "seeded" } : { kind: "git-unseeded" };
  if (context.seeds.has(bagName)) return { kind: "seeded" };

  // A custom-start node is its own entry: nothing upstream is guaranteed to have run before it fires, so only a seed — never a produce — can cover its need.
  return context.customStartIds.has(node.id) ? { kind: "own-start" } : null;
}

function producedCoverage(nodeId: string, producedBy: string[], context: NeedContext): NeedCoverage {
  if (producedBy.length === 0) return { kind: "never-filled" };
  const pathWithout = pathAvoiding(context.goingOut, context.startPoints, new Set(producedBy), nodeId);

  return pathWithout ? { kind: "sometimes-empty", producedBy, pathWithout } : { kind: "filled", producedBy };
}

/** The floor's own message for a need its coverage leaves open, none for one that is covered. */
export function needMissesOf(node: LineNode, need: NeedSpec, coverage: NeedCoverage): string[] {
  const bagName = bagNameOf(node, need);

  if (coverage.kind === "git-unseeded") return [gitMiss(node, need, bagName)];
  if (coverage.kind === "own-start") return [customStartMiss(node, need, bagName)];

  return coverage.kind === "sometimes-empty" || coverage.kind === "never-filled" ? [uncoveredMiss(node, need, bagName)] : [];
}

function bagNameOf(node: LineNode, need: NeedSpec): string {
  return node.bind?.[need.name] ?? need.name;
}

function isExempt(bagName: string): boolean {
  return EXEMPT_NEEDS.includes(bagName);
}

function uncoveredMiss(node: LineNode, need: NeedSpec, bagName: string): string {
  return `node "${node.id}" needs ${needLabel(need, bagName)}, which is not seeded at start and not produced on every path into it`;
}

function customStartMiss(node: LineNode, need: NeedSpec, bagName: string): string {
  return `node "${node.id}" starts by its own event, so its need ${needLabel(need, bagName)} must be seeded at start`;
}

function gitMiss(node: LineNode, need: NeedSpec, bagName: string): string {
  return `node "${node.id}" needs ${needLabel(need, bagName)} as kind "git", which nothing in the line seeds`;
}

function needLabel(need: NeedSpec, bagName: string): string {
  return need.name === bagName ? `"${need.name}"` : `"${need.name}" (bound as "${bagName}")`;
}
