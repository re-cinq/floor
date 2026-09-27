// Pure mapping: a visit's resolved brief onto the AgentDefinition + Station
// + Agent triple the ai-agent-subsystem understands (docs/entities/station.md,
// "the agent kind"; docs/assembly_run_storage.md, "the agent kind runs on
// the ai-agent-subsystem, with no code of ours in the pod"). This is the
// executor's private view the storage doc describes — richer than the
// plain `Brief` a station author sees, because building a Kubernetes
// manifest needs each need's kind, path and access, not just its resolved
// value.
//
// All three resources are named identically, after the visit, and created
// together. Lore syncs one long-lived AgentDefinition/Station pair per
// repo/task-type from a catalog (apps/cluster-agent/src/work/catalog in
// lore); that does not fit here, because a `git` need's branch+sha and a
// `continue` conversation's session id are per-visit — one of the three
// resources would otherwise always be one visit out of date. A per-visit
// triple costs three small objects instead of one; `successfulRunsHistoryLimit`
// /`failedRunsHistoryLimit` (below) are how the subsystem prunes them.
//
// One field is a documented best-effort rather than a verified wire
// contract: `AgentDefinitionSpec.resources.conversation` (`source`/`id`/`pin`).
// The reference confirms the shape and that `id` is opaque and `pin` is
// where this run's own state is saved, but not the exact fetch/save URL
// convention beyond that. This module assumes the init fetches from
// `{source}/{id}` and the supervisor saves to `{source}/{pin}`, both under
// the Floor's own API, and uploads there the same way a watch upload does
// (raw bytes, `headers_secret` for auth). Verify this against a real run
// before relying on `conversation: continue` in production.

import type {
  Agent,
  AgentDefinition,
  Station,
} from "@re-cinq/agent-contracts";

export type DispatchNeed =
  | { name: string; kind: "value"; value: string }
  | {
      name: string;
      kind: "file";
      path: string;
      url: string;
      headersSecret?: string;
    }
  | {
      name: string;
      kind: "git";
      path: string;
      repoUrl: string;
      ref: string;
      tokenSecret?: string;
    };

export interface DispatchProduce {
  name: string;
  kind: "value" | "file";
  /** File produces only: where the agent leaves it, relative to the workspace. */
  path?: string;
}

export type Conversation =
  | { mode: "new" }
  | { mode: "continue"; sessionRef: string };

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
  settings: {
    model?: string;
    /** The unrendered template; the subsystem fills `{placeholder}`s from `parameters`, built here from the `value` needs. The Floor never renders it twice. */
    prompt: string;
    image: string;
    disallowedTools?: string[];
    skills?: string[];
    env?: Record<string, string>;
  };
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

function buildAgentDefinition(
  name: string,
  input: DispatchBrief,
): AgentDefinition {
  const gitNeeds = input.needs.filter(
    (n): n is Extract<DispatchNeed, { kind: "git" }> => n.kind === "git",
  );
  const fileProduces = input.produces.filter(
    (p): p is DispatchProduce & { path: string } =>
      p.kind === "file" && p.path !== undefined,
  );

  return {
    apiVersion: API_VERSION,
    kind: "AgentDefinition",
    metadata: { name, namespace: undefined },
    spec: {
      model: input.settings.model,
      prompt: input.settings.prompt,
      disallowed_tools: input.settings.disallowedTools,
      resources: {
        env: envList(input.settings.env),
        secrets: modelSecret(input),
        repos: gitNeeds.map((need) => ({
          name: need.name,
          url: need.repoUrl,
          ref: need.ref,
          path: need.path,
          token_secret: need.tokenSecret,
        })),
        skills: input.settings.skills,
        conversation: conversationRef(name, input),
      },
      output: {
        format: "stream-json",
        sinks: [
          {
            type: "http",
            url: sinkUrl(input),
            headers_secret: input.tokenSecretKey,
          },
        ],
        watch: fileProduces.map((produce) => ({
          event: `produced.${produce.name}`,
          path: produce.path,
          upload: {
            url: `${input.floorBaseUrl}/blobs`,
            headers_secret: input.tokenSecretKey,
          },
        })),
      },
    },
  };
}

function envList(
  env: Record<string, string> | undefined,
): { name: string; value: string }[] | undefined {
  if (!env) return undefined;

  return Object.entries(env).map(([name, value]) => ({ name, value }));
}

function modelSecret(
  input: DispatchBrief,
): { name: string; ref: string }[] | undefined {
  if (!input.modelSecretKey) return undefined;

  return [{ name: input.modelSecretKey, ref: input.modelSecretKey }];
}

function conversationRef(
  name: string,
  input: DispatchBrief,
): { source: string; id?: string; pin?: string; headers_secret: string } | undefined {
  if (input.conversation.mode === "new") return undefined;

  return {
    source: `${input.floorBaseUrl}/api/conversations`,
    id: input.conversation.sessionRef,
    pin: name,
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
      // A triple is minted per visit (see the file header), so a run of
      // this Station is always exactly one Agent; history beyond that run
      // is noise the moment the visit reports.
      successfulRunsHistoryLimit: 0,
      failedRunsHistoryLimit: 0,
      template: {
        spec: {
          containers: [{ name: "agent", image: input.settings.image }],
        },
      },
    },
  };
}

function buildAgent(name: string, input: DispatchBrief): Agent {
  const gitNeed = input.needs.find(
    (n): n is Extract<DispatchNeed, { kind: "git" }> => n.kind === "git",
  );
  const fileNeeds = input.needs.filter(
    (n): n is Extract<DispatchNeed, { kind: "file" }> => n.kind === "file",
  );
  const valueNeeds = input.needs.filter(
    (n): n is Extract<DispatchNeed, { kind: "value" }> => n.kind === "value",
  );

  return {
    apiVersion: API_VERSION,
    kind: "Agent",
    metadata: { name },
    spec: {
      stationRef: name,
      taskId: input.visitId,
      targetRepo: gitNeed ? repoOwnerName(gitNeed.repoUrl) : undefined,
      branch: gitNeed?.ref,
      parameters: Object.fromEntries(
        valueNeeds.map((need) => [need.name, need.value]),
      ),
      files: fileNeeds.map((need) => ({
        path: need.path,
        url: need.url,
        headers_secret: need.headersSecret,
      })),
    },
  };
}

// `RepoRef`/`AgentSpec.targetRepo` want `owner/name`; a git need's URL is a
// full clone URL (`https://host/owner/name` or `host/owner/name`). Best
// effort for the informational `targetRepo` field only — the actual clone
// uses the full `repoUrl` in `resources.repos[].url`, unaffected if this
// falls back to the input unchanged.
function repoOwnerName(repoUrl: string): string {
  const match = /([^/]+\/[^/]+?)(?:\.git)?$/.exec(repoUrl);

  return match ? match[1]! : repoUrl;
}
