// The studio's picture of a collection: every line with its nodes, every agent, and what was refused. Pure and tolerant: a collection with problems still has a view, and nothing a person wrote makes it throw.
import { coverageContextOf, downstreamOf, needCoverage, nodeEvents, promptPlaceholders, type CollectionLine, type NeedContext } from "@re-cinq/floor-assembly-lines";
import type { LineNode, StationBody } from "@re-cinq/floor-contracts";
import { attempt, collectionOverlay, lineFolderPathOf, lineLayoutOf, withoutReplacedFiles, type AgentPrompts, type CollectionFile, type CollectionOverlay, type Environment, type OverlayAgent, type LineFile, type ShippedCatalog } from "@re-cinq/floor-pipeline";
import type { CollectionView, LineView, NodeView, RefusedFile } from "../view.js";
import { textVersion } from "./agent-file-text.js";
import { agentFilesByName, agentViews, type AgentFiles } from "./agent-views.js";
import { present } from "./present.js";
import { readLine, type ReadLine } from "./read-line.js";

/** `${NAME}` answers itself, so a setting is shown as the file wrote it. */
const AS_WRITTEN: Environment = new Proxy({}, { get: (...given) => `\${${String(given[1])}}` });

/** Nothing is shipped: the studio shows the collection on its own. */
const NOTHING_SHIPPED: ShippedCatalog = { pipelines: [], agents: new Map() };

interface Surroundings {
  lines: CollectionLine[];
  agents: ReadonlyMap<string, OverlayAgent>;
  agentFiles: ReadonlyMap<string, AgentFiles>;
  files: readonly CollectionFile[];
}

export function collectionView(files: readonly CollectionFile[], hostKeys: readonly string[], groups: readonly string[] = []): CollectionView {
  const readFiles = withoutReplacedFiles(files, groups);
  const overlay = collectionOverlay({ files: readFiles, shipped: NOTHING_SHIPPED, env: AS_WRITTEN, hostKeys, groups });
  const lineFiles = lineLayoutOf(readFiles).read;
  const reads = lineFiles.map((file) => attempt(file.path, () => readLine(file, file.folder, promptsOf(overlay.agents))));
  const read = reads.flatMap((result) => ("made" in result ? [result.made] : []));
  const surroundings: Surroundings = { lines: read.map(({ id, body }) => ({ id, body })), agents: overlay.agents, agentFiles: agentFilesByName(readFiles), files: readFiles };
  const views = read.map((line) => attempt(line.file, () => lineViewOf(line, surroundings)));
  const lines = views.flatMap((result) => ("made" in result ? [result.made] : []));
  const refused = refusedOf(overlay, { lineFiles, failures: [...reads, ...views] });

  return { lines, agents: agentViews(overlay.agents, surroundings.agentFiles, lines), refused, counts: countsOf(lines, overlay, refused) };
}

function promptsOf(agents: ReadonlyMap<string, OverlayAgent>): AgentPrompts {
  return new Map([...agents].map(([name, agent]) => [name, agent.settings.prompt]));
}

function lineViewOf(line: ReadLine, surroundings: Surroundings): LineView {
  const { body } = line;
  const needContext = coverageContextOf(body, line.bodies);

  return {
    id: line.id,
    file: line.file,
    entry: body.entry,
    exit: body.exit,
    ...present({ fail: body.fail, start: body.start }),
    args: body.args,
    nodes: body.nodes.map((node) => nodeViewOf(node, line, surroundings, needContext)),
    edges: body.edges,
    problems: line.problems,
  };
}

function nodeViewOf(node: LineNode, line: ReadLine, surroundings: Surroundings, needContext: NeedContext): NodeView {
  const station = node.station ? line.bodies.get(node.station) : undefined;

  return {
    id: node.id,
    ...present({ station: node.station, fanout: node.fanout }),
    ...stationFacts(station, { node, line, needContext }),
    events: nodeEvents(line.body, node, surroundings.lines, line.bodies),
    ...agentOf(node, { line, station }, surroundings),
    ...extraOf(station?.agentDefinition, line, surroundings.files),
  };
}

function extraOf(agentName: string | undefined, line: ReadLine, files: readonly CollectionFile[]): Pick<NodeView, "extra"> {
  const file = `${lineFolderPathOf(line.file)}/agents/${agentName}.extra.md`;
  const text = agentName === undefined ? undefined : files.find((candidate) => candidate.path === file)?.text;

  return text === undefined ? {} : { extra: { file, text, version: textVersion(text) } };
}

function stationFacts(station: StationBody | undefined, { node, line, needContext }: { node: LineNode; line: ReadLine; needContext: NeedContext }): Pick<NodeView, "kind" | "description" | "outcomes" | "needs" | "produces" | "agentDefinition"> {
  const { kind, description, agentDefinition, outcomes = [], needs = [], produces = [] } = station ?? {};

  return {
    ...present({ kind, description, agentDefinition }),
    outcomes,
    needs: needs.map((need) => ({ ...need, coverage: needCoverage(node, need, needContext) })),
    produces: produces.map((produce) => ({ ...produce, readBy: readersOf(produce.name, node, line) })),
  };
}

function readersOf(produceName: string, producer: LineNode, { body, bodies }: ReadLine): string[] {
  const downstream = downstreamOf(producer.id, body.edges);
  const readers = body.nodes.filter(({ id, station }) => station !== undefined && downstream.has(id) && needNamesOf(bodies.get(station)).includes(produceName));

  return readers.map(({ id }) => id);
}

function needNamesOf(station: StationBody | undefined): string[] {
  return (station?.needs ?? []).map(({ name }) => name);
}

function agentOf(node: LineNode, { line, station }: { line: ReadLine; station: StationBody | undefined }, surroundings: Surroundings): Pick<NodeView, "agent" | "placeholders"> {
  const name = station?.agentDefinition ?? "";

  return station?.kind === "agent" && surroundings.agents.has(name) ? agentFacts(name, { node, line, station }, surroundings) : {};
}

function agentFacts(name: string, { node, line, station }: { node: LineNode; line: ReadLine; station: StationBody }, { agents, agentFiles, files }: Surroundings): Pick<NodeView, "agent" | "placeholders"> {
  const { prompt, ...settings } = agents.get(name)?.settings ?? { prompt: null };
  const file = agentFiles.get(name)?.file ?? "";

  return {
    agent: { name, file, version: versionOf(file, files), prompt, settings },
    placeholders: promptPlaceholders({ prompt: prompt ?? "", line: line.body, node, station, bodies: line.bodies }),
  };
}

function versionOf(path: string, files: readonly CollectionFile[]): string | null {
  const text = files.find((file) => file.path === path)?.text;

  return text === undefined ? null : textVersion(text);
}

function refusedOf(overlay: CollectionOverlay, { lineFiles, failures }: { lineFiles: readonly LineFile[]; failures: readonly ReturnType<typeof attempt>[] }): RefusedFile[] {
  const lineFilePaths = new Set(lineFiles.map((file) => file.path));
  const refusedByOverlay = overlay.refused.filter(({ path }) => !lineFilePaths.has(path));
  const refusedHere = failures.flatMap((result) => ("refusal" in result ? [result.refusal] : []));

  return [...refusedByOverlay, ...refusedHere].sort((left, right) => left.path.localeCompare(right.path));
}

function countsOf(lines: readonly LineView[], overlay: CollectionOverlay, refused: readonly RefusedFile[]): CollectionView["counts"] {
  return { lines: lines.length, agents: overlay.counts.agents, refused: refused.length, problems: lines.reduce((total, line) => total + line.problems.length, 0) };
}
