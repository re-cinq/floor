// What a floor's routes answer beyond the plain definition bodies: the shapes that exist only on the wire, and had no name anywhere before this file.
import type { ProduceSpec } from "./definitions.js";

/** RFC 9457. Every error a floor answers is one of these, as `application/problem+json`. */
export interface Problem {
  /** `about:blank` today. Typed wide so a floor may name its own problems later without breaking a client. */
  type: string;
  title: string;
  status: number;
  detail?: string;
  /** What a 400 lists when a body failed to parse, one sentence a field. */
  errors?: string[];
}

export interface ValueNeed {
  name: string;
  kind: "value";
  value: string;
}

export interface FileNeed {
  name: string;
  kind: "file";
  path: string;
  url: string;
}

/** The floor states intent, never a credential: git asks the floor for one when it needs it. */
export interface GitNeed {
  name: string;
  kind: "git";
  path: string;
  repoUrl: string;
  ref: string;
  access: "read" | "write";
}

/** One thing a visit was promised, resolved: a value is its text, a file and a repository are places to read. */
export type BriefNeed = ValueNeed | FileNeed | GitNeed;

/** `sessionRef` names the conversation this visit continues. The store calls the same field `visitId`; the route renames it on the way out, and this is the name a client sees. */
export type BriefConversation = { mode: "new"; save: boolean } | { mode: "continue"; sessionRef: string };

export interface McpServerSettings {
  name: string;
  transport: "stdio" | "http" | "sse";
  command?: string;
  args?: string[];
  url?: string;
  headersSecret?: string;
}

/** An agent definition's `config`, under the names the wire uses rather than the snake_case a definition is authored in. */
export interface ExecutorSettings {
  disallowedTools?: string[];
  skills?: string[];
  skillsSource?: string;
  mcpServers?: McpServerSettings[];
  env?: Record<string, string>;
  permissionMode?: "auto" | "bypass";
  maxTurns?: number;
  podResources?: PodResources;
}

/** Kubernetes quantities by resource name (`cpu`, `memory`, `ephemeral-storage`), as the agent's container is asked for and held to. */
export interface PodResources {
  requests?: Record<string, string>;
  limits?: Record<string, string>;
}

export type BriefSettings = ExecutorSettings & { model?: string; prompt: string; image: string };

/** `GET /station-runs/:id/brief`: everything an executor needs to run one visit, and a token that reaches only this visit. */
export interface VisitBrief {
  visitId: string;
  /** The assembly run this visit belongs to. */
  runId: string;
  /** The assembly line that run walks. */
  lineId: string;
  /** The node of that line this visit is a pass at: with `runId`, what a station keys per-node state on. */
  nodeId: string;
  iteration: number;
  floorBaseUrl: string;
  token: string;
  deadlineMinutes: number;
  settings: BriefSettings | null;
  needs: BriefNeed[];
  produces: ProduceSpec[];
  conversation: BriefConversation;
  modelSecretKey?: string;
}

/** `POST /events/claim` answers only the two events a worker may take, and both name the visit they are about. */
export interface ClaimedEvent {
  id: string;
  name: "station_run.dispatch" | "station_run.abort";
  payload: { visitId: string };
  tags: string[];
  attempts: number;
}

/** What a floor answers for bytes it now keeps: `POST /blobs`, and a saved conversation. */
export interface BlobRef {
  hash: string;
  size: number;
}

export interface PutResult {
  hash: string;
  /** False when the same body was already there under the same hash. */
  created: boolean;
}

export type DefinitionKind = "line" | "station" | "agent_definition" | "schedule" | "migration";

/** A migration is named by its file and known by what that file said, so the same name with different content is refused. */
export interface MigrationBody {
  sha256: string;
}

/** What git's credential helper reads. The floor mints none of these itself; it asks the provider it was given. */
export interface GitCredential {
  username: string;
  password: string;
}
