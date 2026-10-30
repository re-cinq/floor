// Pure mapping: a visit's resolved brief onto the subsystem's resources: a recipe (AgentDefinition + Station) named after what it runs and shared by every visit that runs the same, and an Agent per visit carrying that visit's wiring. See ../../README.md.

import { createHash } from "node:crypto";

import { GROUP, VERSION } from "@re-cinq/agent-contracts";
import type {
  Agent,
  AgentDefinition,
  AgentResources,
  ConversationRef,
  Station,
} from "@re-cinq/agent-contracts";
import type { BriefConversation, BriefNeed, BriefSettings, FileNeed, GitNeed, McpServerSettings, PodResources, ProduceSpec, VisitBrief } from "@re-cinq/floor-contracts";
import { environmentOf } from "./pod-environment.js";
import { identityFor } from "./git-identity.js";
import { promptParameters, runParameters } from "./prompt-parameters.js";

export type DispatchNeed = BriefNeed;
export type DispatchProduce = ProduceSpec;

export type Conversation = BriefConversation;

export type DispatchSettings = BriefSettings;

export type DispatchMcpServer = McpServerSettings;

// The brief as the floor sends it, its `visitId` also the Agent's name, plus what the cluster agent settles itself. Its `floorBaseUrl` is the floor as the pod reaches it (docs/dev_loop.md: `host.minikube.internal` in dev).
export type DispatchBrief = Pick<
  VisitBrief,
  "visitId" | "runId" | "lineId" | "nodeId" | "floorBaseUrl" | "deadlineMinutes" | "needs" | "produces" | "conversation"
> & {
  /** The visit token, already written to `secretName` under this key by the caller; referenced as every `headers_secret` here. */
  tokenSecretKey: string;
  /** The visit token itself: what the pod's git credential helper presents to the floor. */
  visitToken: string;
  /** The `agent-secrets` key holding the API key for this visit's model family; omitted when the model needs none. */
  modelSecretKey?: string;
  secretName: string;
  settings: DispatchSettings;
};

export interface AgentTriple {
  agentDefinition: AgentDefinition;
  station: Station;
  agent: Agent;
}

const API_VERSION = `${GROUP}/${VERSION}`;

/** Marks a Station or AgentDefinition as one the cluster agent made, and may remove once no Agent runs it. */
export const RECIPE_LABEL = "floor.re-cinq.com/recipe";
const STATION_LABEL = "agents.re-cinq.com/station";
const AGENT_DEFINITION_LABEL = "agents.re-cinq.com/agent-definition";
const RECIPE_HASH_LENGTH = 12;

export function buildAgentTriple(input: DispatchBrief): AgentTriple {
  const definitionSpec = recipeSpec(input);
  const stationSpec = (agentDefRef: string) => buildStationSpec(agentDefRef, input);
  const recipe = recipeName(definitionSpec, stationSpec(""));

  return {
    agentDefinition: { apiVersion: API_VERSION, kind: "AgentDefinition", metadata: recipeMetadata(recipe), spec: definitionSpec },
    station: { apiVersion: API_VERSION, kind: "Station", metadata: recipeMetadata(recipe), spec: stationSpec(recipe) },
    agent: buildAgent(recipe, input),
  };
}

// Named after its whole content, so every visit that runs the same settings shares it, and a new version or variant is a new one.
function recipeName(definitionSpec: AgentDefinition["spec"], stationSpec: Station["spec"]): string {
  const hash = createHash("sha256").update(JSON.stringify({ definitionSpec, stationSpec })).digest("hex");

  return `floor-${hash.slice(0, RECIPE_HASH_LENGTH)}`;
}

function recipeMetadata(name: string): { name: string; labels: Record<string, string> } {
  return { name, labels: { [RECIPE_LABEL]: "true" } };
}

// Only what the settings decide: nothing of the visit, or two visits could not share it.
function recipeSpec(input: DispatchBrief): AgentDefinition["spec"] {
  return {
    model: input.settings.model,
    prompt: input.settings.prompt,
    disallowed_tools: input.settings.disallowedTools,
    permission_mode: input.settings.permissionMode ?? "bypass",
    max_turns: input.settings.maxTurns,
    resources: recipeResources(input),
    output: { format: "stream-json" },
  };
}

function recipeResources(input: DispatchBrief): AgentResources {
  return {
    env: envList(environmentOf({ needs: [], model: input.settings.model, defined: input.settings.env })),
    secrets: modelSecret(input),
    skills: input.settings.skills,
    // Always set, skills or none: the subsystem fetches the agent's settings.json from here, and starts Claude pointing at it.
    skills_source: input.settings.skillsSource ?? `${input.floorBaseUrl}/skills`,
    mcp_servers: mcpServersOf(input.settings),
  };
}

function mcpServersOf(settings: DispatchSettings): AgentResources["mcp_servers"] {
  const servers = settings.mcpServers;

  return servers?.map(({ headersSecret, ...server }) => ({ ...server, headers_secret: headersSecret }));
}

function envList(env: Record<string, string> | undefined): { name: string; value: string }[] | undefined {
  if (!env) return undefined;

  return Object.entries(env).map(([name, value]) => ({ name, value }));
}

function modelSecret(input: DispatchBrief): { name: string; ref: string }[] | undefined {
  if (!input.modelSecretKey) return undefined;

  return [{ name: input.modelSecretKey, ref: input.modelSecretKey }];
}

function buildStationSpec(agentDefRef: string, input: DispatchBrief): Station["spec"] {
  return {
    agentDefRef,
    // The definition's budget, not the minutes this visit has left: those differ for every visit, and would give each its own recipe.
    deadlineMinutes: input.settings.timeoutMinutes ?? input.deadlineMinutes,
    // Never 0. At 0 the controller deletes a finished Agent at once, then reconciles the copy still in its cache and runs the job a second time. A visit's Agent is deleted when its abort is claimed.
    successfulRunsHistoryLimit: 1,
    failedRunsHistoryLimit: 1,
    template: { spec: { containers: [agentContainer(input.settings)] } },
  };
}

// No `resources` key at all when the definition sets none: the runtime's own default then applies.
function agentContainer(settings: DispatchSettings): { name: string; image: string; resources?: PodResources } {
  const container = { name: "agent", image: settings.image };

  return settings.podResources ? { ...container, resources: settings.podResources } : container;
}

function buildAgent(recipe: string, input: DispatchBrief): Agent {
  const gitNeed = gitNeedsOf(input).at(0);
  const fileNeeds = input.needs.filter((need): need is FileNeed => need.kind === "file");

  return {
    apiVersion: API_VERSION,
    kind: "Agent",
    // Labelled as the controller would, at creation, so no moment passes in which the recipe looks unused.
    metadata: { name: `floor-${input.visitId}`, labels: { [STATION_LABEL]: recipe, [AGENT_DEFINITION_LABEL]: recipe } },
    spec: {
      stationRef: recipe,
      taskId: input.visitId,
      targetRepo: gitNeed ? repoOwnerName(gitNeed.repoUrl) : undefined,
      branch: gitNeed?.ref,
      parameters: { ...runParameters(input), ...promptParameters(input.needs, input.produces), ...brokerParameters(input, gitNeed) },
      files: fileNeeds.map((need) => ({ path: need.path, url: need.url, headers_secret: input.tokenSecretKey })),
      repos: gitNeedsOf(input).map((need) => ({ name: need.name, url: need.repoUrl, ref: need.ref, path: need.path })),
      conversation: conversationRef(input),
      output: runOutput(input),
      env: runEnvironment(input),
    },
  };
}

// The subsystem lifts these two out of the parameters and into the clone's credential helper, which asks the floor for a token when git authenticates. They go last, so no value need can take their names.
function brokerParameters(input: DispatchBrief, gitNeed: GitNeed | undefined): Record<string, string> {
  if (!gitNeed) return {};

  return { git_credential: input.visitToken, git_credential_url: `${input.floorBaseUrl}/station-runs/${input.visitId}/git-credential` };
}

// `AgentSpec.targetRepo` wants `owner/name`; a git need's url is a full clone url. Best effort, informational only: the actual clone uses the full `repoUrl`.
function repoOwnerName(repoUrl: string): string {
  const match = /([^/]+\/[^/]+?)(?:\.git)?$/.exec(repoUrl);

  return match ? match[1]! : repoUrl;
}

// The floor's git identity for a visit that writes; a variable the definition sets itself wins, so it stays the recipe's.
function runEnvironment(input: DispatchBrief): { name: string; value: string }[] | undefined {
  const defined = input.settings.env ?? {};
  const told = Object.entries(identityFor(input.needs)).filter(([name]) => !(name in defined));

  return told.length > 0 ? told.map(([name, value]) => ({ name, value })) : undefined;
}

function runOutput(input: DispatchBrief): NonNullable<Agent["spec"]>["output"] {
  return {
    sinks: [{ type: "http", url: sinkUrl(input), headers_secret: input.tokenSecretKey }],
    watch: fileProducesOf(input).map((produce) => ({
      event: `produced.${produce.name}`,
      path: produce.path,
      upload: { url: `${input.floorBaseUrl}/blobs`, headers_secret: input.tokenSecretKey },
    })),
  };
}

function gitNeedsOf(input: DispatchBrief): GitNeed[] {
  return input.needs.filter((need): need is GitNeed => need.kind === "git");
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

function fileProducesOf(input: DispatchBrief): (DispatchProduce & { path: string })[] {
  return input.produces.filter(
    (produce): produce is DispatchProduce & { path: string } =>
      produce.kind === "file" && produce.path !== undefined,
  );
}

function sinkUrl(input: DispatchBrief): string {
  return `${input.floorBaseUrl}/station-runs/${input.visitId}/sink`;
}
