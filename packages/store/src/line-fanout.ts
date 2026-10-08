// Pure: what makes a fan-out region self-consistent — a source that lists items, a body that runs once per item and can fail, and joins that collect only what a body produces.
import { hasStation, resolvedStationOf } from "./line-stations.js";
import type { LineBody, LineNode, StationBody } from "./types.js";

type FanSource = LineNode & { fanout: NonNullable<LineNode["fanout"]> };
type Bodies = ReadonlyMap<string, StationBody> | undefined;

export function fanoutChecks(line: LineBody, bodies: Bodies): string[] {
  const sources = line.nodes.filter(isSource);

  return [
    ...sources.flatMap((source) => sourceChecks(line, source, bodies)),
    ...bodyChecks(line, sources),
    ...collectChecks(line, sources, bodies),
  ];
}

function isSource(node: LineNode): node is FanSource {
  return node.fanout !== undefined;
}

function sourceChecks(
  line: LineBody,
  source: FanSource,
  bodies: Bodies,
): string[] {
  const { over, to } = source.fanout;
  const problems: string[] = [];

  if (!line.nodes.some((node) => node.id === to))
    problems.push(
      `node "${source.id}" fans out to "${to}", which is not a node`,
    );
  if (!producesValue(source, over, bodies))
    problems.push(
      `node "${source.id}" fans out over "${over}", which its station does not produce as a value`,
    );

  if (
    !line.edges.some(
      (edge) =>
        edge.from === source.id && edge.to === to && edge.on === "success",
    )
  ) {
    problems.push(
      `node "${source.id}" fans out to "${to}" but has no success edge to it`,
    );
  }

  return problems;
}

// Opaque stations (pinned, unknown, or a line checked without bodies) pass: the check cannot see inside them.
function producesValue(
  source: FanSource,
  over: string,
  bodies: Bodies,
): boolean {
  const body = hasStation(source)
    ? resolvedStationOf(source, bodies)
    : undefined;

  return (
    !bodies ||
    !body ||
    body.produces.some(
      (produce) => produce.name === over && produce.kind === "value",
    )
  );
}

function bodyChecks(line: LineBody, sources: FanSource[]): string[] {
  const targets = sources.map((source) => source.fanout.to);
  const sourceIds = new Set(sources.map((source) => source.id));
  const bodyIds = [...new Set(targets)];

  return bodyIds.flatMap((id) => [
    ...(targets.filter((to) => to === id).length > 1
      ? [`node "${id}" is the body of more than one fan-out`]
      : []),
    ...(sourceIds.has(id)
      ? [`node "${id}" is the body of a fan-out and cannot fan out itself`]
      : []),
    ...failedEdgeChecks(line, id),
  ]);
}

function failedEdgeChecks(line: LineBody, id: string): string[] {
  const routed = line.edges.some(
    (edge) =>
      edge.from === id && (edge.on === "failed" || edge.on === "always"),
  );

  return routed
    ? []
    : [`node "${id}" is the body of a fan-out and needs an edge for failed`];
}

function collectChecks(
  line: LineBody,
  sources: FanSource[],
  bodies: Bodies,
): string[] {
  const producers = producersByName(line, sources, bodies);
  const stationNodes = line.nodes.filter(hasStation);

  return stationNodes.flatMap((node) => {
    const needs = resolvedStationOf(node, bodies)?.needs ?? [];

    return needs.flatMap((need) =>
      collectProblem(node.id, need.collect, producers),
    );
  });
}

function collectProblem(
  nodeId: string,
  collect: string | undefined,
  producers: ReadonlyMap<string, number>,
): string[] {
  if (collect === undefined) return [];
  const count = producers.get(collect) ?? 0;

  if (count === 0) {
    return [
      `node "${nodeId}" collects "${collect}", which no fan-out body produces as a value`,
    ];
  }

  return count > 1
    ? [
        `node "${nodeId}" collects "${collect}", which more than one fan-out body produces`,
      ]
    : [];
}

// How many fan-out bodies produce each value name: a collected name must come from exactly one, or the branches of two fan-outs would mix.
function producersByName(
  line: LineBody,
  sources: FanSource[],
  bodies: Bodies,
): Map<string, number> {
  const bodyIds = new Set(sources.map((source) => source.fanout.to));
  const stationNodes = line.nodes.filter(hasStation);
  const names = stationNodes
    .filter((node) => bodyIds.has(node.id))
    .flatMap((node) => valuesProducedBy(node, bodies));

  return names.reduce(
    (counts, name) => counts.set(name, (counts.get(name) ?? 0) + 1),
    new Map<string, number>(),
  );
}

function valuesProducedBy(
  node: LineNode & { station: string },
  bodies: Bodies,
): string[] {
  const produces = resolvedStationOf(node, bodies)?.produces ?? [];

  return produces
    .filter((produce) => produce.kind === "value")
    .map((produce) => produce.name);
}
