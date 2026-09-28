// Pure mapping: a visit's resolved brief onto the AgentDefinition + Station + Agent triple the ai-agent-subsystem understands. See ../../README.md for the two judgement calls this makes (a triple per visit, and the conversation wire contract).

import type {
  Agent,
  AgentDefinition,
  AgentResources,
  ConversationRef,
  OutputSpec,
  Station,
} from "@re-cinq/agent-contracts";
import type { ValueNeed, FileNeed, GitNeedResolved, Produce } from "./need.js";

export type DispatchNeed = ValueNeed | FileNeed | GitNeedResolved;
export type DispatchProduce = Produce;

/** `sessionRef` is the earlier visit's id: what the subsystem resumes, and fetches the archive by. `save` on a new conversation is the first round of a station that continues. */
export type Conversation = { mode: "new"; save?: boolean } | { mode: "continue"; sessionRef: string };

export interface DispatchSettings {
  model?: string;
  /** The unrendered template; the subsystem fills `{placeholder}`s from `parameters`, built here from the `value` needs. The Floor never renders it twice. */
  prompt: string;
  image: string;
  disallowedTools?: string[];
  skills?: string[];
  env?: Record<string, string>;
  /** `bypass` unless the definition says otherwise: a pod has nobody to answer a permission prompt, so `auto` there means every tool is refused. */
  permissionMode?: "auto" | "bypass";
  maxTurns?: number;
}

export interface DispatchBrief {
  /** The station run id; also the name given to all three resources. */
  visitId: string;
  /** The Floor's own base URL, reachable from the pod (docs/dev_loop.md: `host.minikube.internal` in dev). */
  floorBaseUrl: string;
  /** The visit token, already written to `secretName` under this key by the caller; referenced as every `headers_secret` here. */
  tokenSecretKey: string;
  /** The `agent-secrets` key holding the API key for this visit's model family; omitted when the model needs none. */
  modelSecretKey?: string;
  secretName: string;
  deadlineMinutes: number;
  settings: DispatchSettings;
  needs: DispatchNeed[];
  produces: DispatchProduce[];
  conversation: Conversation;
}

export interface AgentTriple {
  agentDefinition: AgentDefinition;
  station: Station;
  agent: Agent;
}

const API_VERSION = "agents.re-cinq.com/v1alpha1";

export function buildAgentTriple(input: DispatchBrief): AgentTriple {
  const name = `floor-${input.visitId}`;

  return {
    agentDefinition: buildAgentDefinition(name, input),
    station: buildStation(name, input),
    agent: buildAgent(name, input),
  };
}

function buildAgentDefinition(name: string, input: DispatchBrief): AgentDefinition {
  return {
    apiVersion: API_VERSION,
    kind: "AgentDefinition",
    metadata: { name },
    spec: {
      model: input.settings.model,
      prompt: input.settings.prompt,
      disallowed_tools: input.settings.disallowedTools,
      permission_mode: input.settings.permissionMode ?? "bypass",
      max_turns: input.settings.maxTurns,
      resources: agentResources(name, input),
      output: outputSpec(input),
    },
  };
}

function agentResources(name: string, input: DispatchBrief): AgentResources {
  return {
    env: envList(input.settings.env),
    secrets: modelSecret(input),
    repos: gitNeedsOf(input).map((need) => ({
      name: need.name,
      url: need.repoUrl,
      ref: need.ref,
      path: need.path,
      token_secret: need.tokenSecret,
    })),
    skills: input.settings.skills,
    // Always set, skills or none: the subsystem fetches the agent's settings.json from here, and starts Claude pointing at it.
    skills_source: `${input.floorBaseUrl}/skills`,
    conversation: conversationRef(input),
  };
}

function outputSpec(input: DispatchBrief): OutputSpec {
  return {
    format: "stream-json",
    sinks: [{ type: "http", url: sinkUrl(input), headers_secret: input.tokenSecretKey }],
    watch: fileProducesOf(input).map((produce) => ({
      event: `produced.${produce.name}`,
      path: produce.path,
      upload: { url: `${input.floorBaseUrl}/blobs`, headers_secret: input.tokenSecretKey },
    })),
  };
}

function gitNeedsOf(input: DispatchBrief): GitNeedResolved[] {
  return input.needs.filter((need): need is GitNeedResolved => need.kind === "git");
}

function fileProducesOf(input: DispatchBrief): (DispatchProduce & { path: string })[] {
  return input.produces.filter(
    (produce): produce is DispatchProduce & { path: string } =>
      produce.kind === "file" && produce.path !== undefined,
  );
}

function envList(env: Record<string, string> | undefined): { name: string; value: string }[] | undefined {
  if (!env) return undefined;

  return Object.entries(env).map(([name, value]) => ({ name, value }));
}

function modelSecret(input: DispatchBrief): { name: string; ref: string }[] | undefined {
  if (!input.modelSecretKey) return undefined;

  return [{ name: input.modelSecretKey, ref: input.modelSecretKey }];
}

// The pin is the visit id, not the resource name: the subsystem hands it to the agent as its session id, which must be a uuid.
function conversationRef(input: DispatchBrief): ConversationRef | undefined {
  const conversation = input.conversation;

  if (conversation.mode === "new" && !conversation.save) return undefined;

  return {
    source: `${input.floorBaseUrl}/conversations`,
    id: conversation.mode === "continue" ? conversation.sessionRef : undefined,
    pin: input.visitId,
    headers_secret: input.tokenSecretKey,
  };
}

function sinkUrl(input: DispatchBrief): string {
  return `${input.floorBaseUrl}/station-runs/${input.visitId}/sink`;
}

function buildStation(name: string, input: DispatchBrief): Station {
  return {
    apiVersion: API_VERSION,
    kind: "Station",
    metadata: { name },
    spec: {
      agentDefRef: name,
      deadlineMinutes: input.deadlineMinutes,
      // Never 0. At 0 the controller deletes a finished Agent at once, then reconciles the copy still in its cache and runs the job a second time. The triple is deleted when the visit's abort is claimed.
      successfulRunsHistoryLimit: 1,
      failedRunsHistoryLimit: 1,
      template: { spec: { containers: [{ name: "agent", image: input.settings.image }] } },
    },
  };
}

function buildAgent(name: string, input: DispatchBrief): Agent {
  const gitNeed = gitNeedsOf(input).at(0);
  const fileNeeds = input.needs.filter((need): need is FileNeed => need.kind === "file");
  const valueNeeds = input.needs.filter((need): need is ValueNeed => need.kind === "value");

  return {
    apiVersion: API_VERSION,
    kind: "Agent",
    metadata: { name },
    spec: {
      stationRef: name,
      taskId: input.visitId,
      targetRepo: gitNeed ? repoOwnerName(gitNeed.repoUrl) : undefined,
      branch: gitNeed?.ref,
      parameters: Object.fromEntries(valueNeeds.map((need) => [need.name, need.value])),
      files: fileNeeds.map((need) => ({ path: need.path, url: need.url, headers_secret: input.tokenSecretKey })),
    },
  };
}

// `AgentSpec.targetRepo` wants `owner/name`; a git need's url is a full clone url. Best effort, informational only: the actual clone uses the full `repoUrl`.
function repoOwnerName(repoUrl: string): string {
  const match = /([^/]+\/[^/]+?)(?:\.git)?$/.exec(repoUrl);

  return match ? match[1]! : repoUrl;
}
