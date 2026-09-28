// The shapes docs/assembly_run_storage.md ("The rows", "The station contract") and docs/entities/*.md name; see README.md for what each definition body field means.

export type ItemKind = "value" | "file" | "git";

// value: ref is the text. file: ref is the blob hash. git: ref is "host/owner/name@branch", sha is what the branch pointed at when the item was written.
export interface Item {
  kind: ItemKind;
  ref: string;
  by: string;
  sha?: string;
}

export interface Brief {
  needs: Record<string, string>;
  iteration: number;
}

export interface Report {
  outcome: string;
  produced?: Record<string, string>;
  sessionRef?: string;
  error?: string;
}

export interface Run {
  id: string;
  lineId: string;
  lineHash: string;
  repo: string;
  subjectKey: string | null;
  startItems: Record<string, Item>;
  outcome: string | null;
  reason: string | null;
  finishedAt: Date | null;
}

export interface Visit {
  id: string;
  runId: string;
  nodeId: string;
  iteration: number;
  stationHash: string | null;
  agentDefinitionHash: string | null;
  brief: Brief;
  report: Report | null;
  worker: string | null;
  requestedBy: string | null;
  deadline: Date | null;
  /** Beyond the plain Brief: the previous visit's sessionRef, for an executor restoring a conversation. Not part of docs/assembly_run_storage.md's public Brief, which a station author sees; this is the executor's own lookup, resolved once here so it is not repeated. */
  resumedFrom: string | null;
  /** Beyond the plain Brief: the resolved agent settings bundle (model, prompt, image, timeout), for an executor building the CR. */
  agentSettings: AgentSettings | null;
}

export interface LineArgSpec {
  kind: ItemKind;
  subject?: boolean;
}

/** What a `when` compares a payload field against: equality on its text form, nothing more. */
export type WhenValue = string | number | boolean;

export interface LineStart {
  on: string[];
  when?: Record<string, WhenValue>;
  args: Record<string, string>;
}

export interface LineNodeReport {
  on: string;
  when?: Record<string, WhenValue>;
  outcome: string;
}

export interface LineNode {
  id: string;
  /** Omitted for a marker; `name@hash` pins a version. */
  station?: string;
  /** Defaults to `node.<id>.start`. */
  start?: string;
  bind?: Record<string, string>;
  reports?: LineNodeReport[];
}

export interface LineEdge {
  from: string;
  to: string;
  on: string;
  iterationMax?: number;
}

export interface LineBody {
  entry: string;
  exit: string;
  start?: LineStart;
  args: Record<string, LineArgSpec>;
  /** Name -> blob hash, seeded into every run's bag at start. */
  files?: Record<string, string>;
  nodes: LineNode[];
  edges: LineEdge[];
}

export type StationKind = "agent" | "service" | "human";

export interface NeedSpec {
  name: string;
  kind: ItemKind;
  /** Agent kind only. */
  path?: string;
  /** `git` needs only; `read` is the default. */
  access?: "read" | "write";
  optional?: boolean;
}

export interface ProduceSpec {
  name: string;
  kind: "value" | "file";
  path?: string;
}

export interface StationBody {
  kind: StationKind;
  /** Agent kind only. */
  agentDefinition?: string;
  conversation?: "new" | "continue";
  conversationKey?: string;
  outcomes: string[];
  mustChange?: boolean;
  needs: NeedSpec[];
  produces: ProduceSpec[];
  /** Service kind only. */
  url?: string;
  /** Human kind only. */
  route?: string;
}

export interface AgentSettings {
  model?: string;
  prompt: string;
  image: string;
  timeoutMinutes: number;
  tags?: string[];
  config?: Record<string, unknown>;
}

export interface AgentDefinitionBody {
  settings: AgentSettings;
  /** `host/owner/name` -> a partial bundle merged over `settings`. */
  variants?: Record<string, Partial<AgentSettings>>;
}
