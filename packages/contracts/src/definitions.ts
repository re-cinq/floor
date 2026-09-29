// The bodies a floor's routes take and answer. JSON-native by rule — no Date, no Buffer — which is what makes them safe to share between the server, its store and every client.

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
  /** Agent kind, `file` only: the file is what the agent said last, whole, and not something it wrote to `path`. How a prompt that answers in its output, as lore's do, hands that answer on. */
  from?: "output";
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

/** What a model costs, in US dollars for a million tokens. */
export interface ModelPrice {
  inputPerMillion: number;
  outputPerMillion: number;
  /** For what was read from the cache, and written to it; the input price when not stated. */
  cacheReadPerMillion?: number;
  cacheWritePerMillion?: number;
}

export interface AgentSettings {
  model?: string;
  prompt: string;
  image: string;
  timeoutMinutes: number;
  tags?: string[];
  config?: Record<string, unknown>;
  /** Model -> its price, for an agent that counts tokens and names no cost: the model it is given, and any it calls on the side. The floor holds no price of its own. */
  prices?: Record<string, ModelPrice>;
}

export interface AgentDefinitionBody {
  settings: AgentSettings;
  /** `host/owner/name` -> a partial bundle merged over `settings`. */
  variants?: Record<string, Partial<AgentSettings>>;
}

export interface ScheduleBody {
  cron: string;
  /** Defaults to UTC. */
  timezone?: string;
  payload: Record<string, unknown>;
}
