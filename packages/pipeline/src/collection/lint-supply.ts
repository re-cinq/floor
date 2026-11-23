// What the floor's own rules say about a pipeline file: whether each need is covered on every path into its node, and whether each `{placeholder}` of an agent's prompt is supplied. The lint reads a loose shape, so the file is turned into the contract types here, once, and the answers come from `@re-cinq/floor-assembly-lines`.

import {
  coverageContextOf,
  needCoverage,
  needMissesOf,
  promptPlaceholders,
  type NeedContext,
  type NeedCoverage,
} from "@re-cinq/floor-assembly-lines";
import type {
  ItemKind,
  LineBody,
  LineNode,
  NeedSpec,
  ProduceSpec,
  StationBody,
} from "@re-cinq/floor-contracts";
import {
  problem,
  type BagItem,
  type Checked,
  type Node,
  type PipelineProblem,
  type Station,
} from "./lint-shape.js";

export interface Supply {
  checked: Checked;
  line: LineBody;
  bodies: Map<string, StationBody>;
  context: NeedContext;
}

export function supplyOf(checked: Checked): Supply {
  const line = lineBodyOf(checked);
  const bodies = new Map(
    Object.entries(checked.stations).map(([name, station]) => [name, stationBodyOf(station)]),
  );

  return { checked, line, bodies, context: coverageContextOf(line, bodies) };
}

function lineBodyOf(checked: Checked): LineBody {
  const { line } = checked;

  return {
    entry: line.entry,
    exit: line.exit,
    fail: line.fail,
    args: Object.fromEntries(
      Object.entries(line.args).map(([name, arg]) => [name, { kind: itemKindOf(arg.kind) }]),
    ),
    // The analysis reads a file by its name; its hash is the floor's, not the file's.
    files: Object.fromEntries(Object.keys(line.files ?? {}).map((name) => [name, ""])),
    nodes: line.nodes.map(nodeOf),
    edges: line.edges.map((edge) => ({ from: edge.from, to: edge.to, on: edge.on ?? "" })),
  };
}

function nodeOf(node: Node): LineNode {
  return { id: node.id, station: node.station, start: node.start, bind: node.bind };
}

function stationBodyOf(station: Station): StationBody {
  return {
    kind: station.kind === "agent" || station.kind === "human" ? station.kind : "service",
    outcomes: station.outcomes,
    needs: (station.needs ?? []).flatMap(needOf),
    produces: (station.produces ?? []).flatMap(produceOf),
  };
}

function needOf(bagItem: BagItem): NeedSpec[] {
  if (bagItem.name === undefined) return [];
  const { path } = bagItem as { path?: unknown };

  return [
    {
      name: bagItem.name,
      kind: itemKindOf(bagItem.kind),
      ...(typeof path === "string" && { path }),
      optional: bagItem.optional,
      collect: bagItem.collect === undefined ? undefined : String(bagItem.collect),
    },
  ];
}

function produceOf(bagItem: BagItem): ProduceSpec[] {
  if (bagItem.name === undefined) return [];
  const { path } = bagItem as { path?: unknown };

  return [{ name: bagItem.name, kind: bagItem.kind === "file" ? "file" : "value", ...(typeof path === "string" && { path }) }];
}

function itemKindOf(kind: string | undefined): ItemKind {
  return kind === "git" || kind === "file" ? kind : "value";
}

/** A node of the contract shape beside the body of the station it names. */
export interface StationNode {
  node: LineNode;
  body: StationBody;
}

export function unseededNeeds(supply: Supply, { node, body }: StationNode): PipelineProblem[] {
  return body.needs.flatMap((need) => {
    const coverage = needCoverage(node, need, supply.context);

    return unseededMessages(node, need, coverage).map((detail) =>
      problem(supply.checked, node.id, "unseeded-need", detail),
    );
  });
}

function unseededMessages(node: LineNode, need: NeedSpec, coverage: NeedCoverage): string[] {
  if (coverage.kind === "never-filled") return [neverFilledMessage(node, need)];
  const messages = needMissesOf(node, need, coverage);

  return coverage.kind === "sometimes-empty"
    ? messages.map((message) => `${message}, as on the path ${coverage.pathWithout.join(" > ")}`)
    : messages;
}

function neverFilledMessage(node: LineNode, need: NeedSpec): string {
  const bagName = node.bind?.[need.name] ?? need.name;
  const label = need.name === bagName ? `"${need.name}"` : `"${need.name}" (bound as "${bagName}")`;

  return `node "${node.id}" needs ${label}, which nothing in the line seeds or produces`;
}

export function unsuppliedInputs(
  supply: Supply,
  stationNode: StationNode,
  prompt: { definition: string; text: string | null | undefined },
): PipelineProblem[] {
  const { node, body } = stationNode;
  if (body.kind !== "agent" || !prompt.text) return [];
  const { placeholders } = promptPlaceholders({ prompt: prompt.text, line: supply.line, node, station: body, bodies: supply.bodies });
  const names = placeholders.filter((row) => row.state === "unsupplied").map((row) => row.name).sort();
  const listed = names.filter((name) => isListed(name, body));
  const unlisted = names.filter((name) => !listed.includes(name));

  return [
    ...(unlisted.length > 0 ? [unlistedDetail(prompt.definition, unlisted)] : []),
    ...(listed.length > 0 ? [misreadDetail(prompt.definition, listed)] : []),
  ].map((detail) => problem(supply.checked, node.id, "unsupplied-input", detail));
}

// A file item named `ticket` is listed, though a prompt reads it as `{ticket_path}`.
function isListed(name: string, body: StationBody): boolean {
  const declared = new Set([...body.needs, ...body.produces].map((entry) => entry.name));

  return declared.has(name) || declared.has(name.replace(/_path$/, ""));
}

function unlistedDetail(definition: string, names: string[]): string {
  return `the ${definition} prompt reads ${names.join(", ")}, which the station lists in neither its needs nor its produces`;
}

function misreadDetail(definition: string, names: string[]): string {
  return `the ${definition} prompt reads ${names.join(", ")}, which the station lists but does not give under that name: a value need is read as {name}, a file or git need and a produce with a path as {name_path}`;
}
