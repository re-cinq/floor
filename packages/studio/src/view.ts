// What the studio knows of a collection, as plain JSON: no Map, no class, no undefined that JSON would lose. Types only, so a browser bundle takes this file for nothing.
import type { NeedCoverage, NodeEvents, PromptPlaceholders } from "@re-cinq/floor-assembly-lines";
import type { LineArgSpec, LineEdge, LineStart, NeedSpec, ProduceSpec, StationKind } from "@re-cinq/floor-contracts";

export interface ViewProblem {
  /** A rule of the collection's lint, or `line-validation` for what the floor's own check of a line body says. */
  rule: string;
  node?: string;
  message: string;
}

export interface NodeAgent {
  name: string;
  file: string;
  version: string | null;
  prompt: string | null;
  settings: Record<string, unknown>;
}

export interface NodeNeed extends NeedSpec {
  coverage: NeedCoverage;
}

export interface NodeProduce extends ProduceSpec {
  /** The ids of the line's other nodes whose station needs this produce by name. */
  readBy: string[];
}

export interface NodeView {
  id: string;
  /** The station the node names. Absent for a marker node. */
  station?: string;
  /** The list this node reports and the node that then runs once per item. */
  fanout?: { over: string; to: string };
  /** Absent when the line's file does not define the station. */
  kind?: StationKind;
  description?: string;
  outcomes: string[];
  needs: NodeNeed[];
  produces: NodeProduce[];
  agentDefinition?: string;
  events: NodeEvents;
  /** Present for an agent station whose agent a file of the collection defines. */
  agent?: NodeAgent;
  placeholders?: PromptPlaceholders;
  /** The agent's `<agent>.extra.md` file, when the collection has one. */
  extra?: { file: string; text: string; version: string };
}

export interface LineView {
  id: string;
  /** The path of the line's file, from the collection's root. */
  file: string;
  entry: string;
  exit: string;
  fail?: string;
  start?: LineStart;
  args: Record<string, LineArgSpec>;
  nodes: NodeView[];
  edges: LineEdge[];
  problems: ViewProblem[];
}

export interface AgentUse {
  line: string;
  node: string;
}

export interface AgentView {
  name: string;
  file: string;
  extraFile?: string;
  source: "collection-new" | "replaced" | "extended";
  /** Exactly as the file writes them: `${NAME}` is not filled from the environment. */
  settings: Record<string, unknown>;
  prompt: string | null;
  usedBy: AgentUse[];
}

export interface RefusedFile {
  path: string;
  reason: string;
}

export interface CollectionView {
  /** The name of the collection's folder. Set by the backend that knows it, so the pure `collectionView` leaves it out. */
  folder?: string;
  /** The names of the `skills/*.md` files. Set by the backend, like `folder`. */
  skills?: string[];
  lines: LineView[];
  agents: AgentView[];
  refused: RefusedFile[];
  counts: { lines: number; agents: number; refused: number; problems: number };
}
