// What an agent definition's `config` may say to the subsystem, under the names docs/entities/agent-definition.md gives them, which are lore's own. Anything else in `config` is kept and passed to nobody.
import { Refusal, type AgentSettings } from "@floor/store";
import type { BriefSettings, ExecutorSettings } from "@re-cinq/floor-contracts";
import { z } from "zod";
import { issuesOf } from "./parse.js";

// A header or env var the server needs, valued from the key `ref` of the cluster's agent-secrets.
const secretRef = z.object({
  name: z.string().min(1).describe("The name of the header or environment variable."),
  ref: z.string().min(1).describe("The key of the cluster's `agent-secrets` that holds its value."),
});

// One of the two ways to reach a server, never neither: a process the pod starts, or an address it calls.
const mcpServer = z
  .object({
    name: z.string().min(1).describe("The name the agent knows the server by."),
    transport: z.enum(["stdio", "http", "sse"]).describe("How the server is reached. `stdio` is a process the pod starts. `http` and `sse` are an address it calls."),
    command: z.string().min(1).describe("`stdio` only, and required there. The command that starts the server.").optional(),
    args: z.array(z.string()).describe("`stdio` only. The command's arguments.").optional(),
    url: z.url().describe("`http` and `sse` only, and required there. The server's address.").optional(),
    headers_secret: z.string().min(1).describe("The key of `agent-secrets` that holds one whole header line, such as `Authorization: Bearer <token>`.").optional(),
    headers: z.array(secretRef).describe("`http` and `sse` only. Headers sent to the server, each valued from `agent-secrets`.").optional(),
    env: z.array(secretRef).describe("`stdio` only. Environment variables of the server's process, each valued from `agent-secrets`.").optional(),
  })
  .refine((server) => (server.transport === "stdio" ? Boolean(server.command) : Boolean(server.url)), {
    message: "a stdio server needs a command, any other a url",
  });

const KUBERNETES_QUANTITY = /^\d+(\.\d+)?(m|k|M|G|T|Ki|Mi|Gi|Ti)?$/;

const quantity = z.string().regex(KUBERNETES_QUANTITY, "a Kubernetes quantity such as 250m, 1, 512Mi or 2Gi");

const resourceQuantities = z.strictObject({
  cpu: quantity.describe("A Kubernetes quantity, such as `500m`.").optional(),
  memory: quantity.describe("A Kubernetes quantity, such as `2Gi`.").optional(),
  "ephemeral-storage": quantity.describe("A Kubernetes quantity, such as `6Gi`.").optional(),
});

const podResources = z.strictObject({
  requests: resourceQuantities.describe("What the pod asks for.").optional(),
  limits: resourceQuantities.describe("What the pod may not exceed.").optional(),
});

export const agentConfigSchema = z.looseObject({
  skills: z.array(z.string()).describe("Names of the skills the agent is given.").optional(),
  skills_source: z.url().describe("Where the pod fetches each named skill and the agent's settings. Defaults to the floor's own `/skills`, which serves no skills.").optional(),
  mcp_servers: z.array(mcpServer).describe("The MCP servers the agent can call.").optional(),
  disallowed_tools: z.array(z.string()).describe("Tools the agent may not use.").optional(),
  env: z.record(z.string(), z.string()).describe("Environment variables of the agent, as plain values.").optional(),
  permission_mode: z.enum(["auto", "bypass"]).describe("How the agent asks before it acts. Defaults to `bypass`.").optional(),
  max_turns: z.number().int().positive().describe("The most turns the agent takes in one visit.").optional(),
  model_secret_key: z.string().min(1).describe("The key of `agent-secrets` that holds the model's API key.").optional(),
  pod_resources: podResources.describe("The resources of the agent's container. With none, the cluster's default applies.").optional(),
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;

/** The same settings under the names the floor's own wire uses. */
export function executorSettings(config: AgentConfig): ExecutorSettings {
  return {
    disallowedTools: config.disallowed_tools,
    skills: config.skills,
    skillsSource: config.skills_source,
    mcpServers: config.mcp_servers?.map(({ headers_secret: headersSecret, ...server }) => ({ ...server, headersSecret })),
    env: config.env,
    permissionMode: config.permission_mode,
    maxTurns: config.max_turns,
    podResources: config.pod_resources,
  };
}

// A definition's config was checked when it was put; one that no longer reads is refused here, by name, and never half-applied.
export function dispatchSettings(settings: AgentSettings): BriefSettings {
  const config = agentConfigSchema.safeParse(settings.config ?? {});

  if (!config.success) throw new Refusal(`the agent definition's config cannot be read: ${issuesOf(config.error).join("; ")}`);

  return { model: settings.model, prompt: settings.prompt, image: settings.image, timeoutMinutes: settings.timeoutMinutes, ...executorSettings(config.data) };
}

export function modelSecretKeyOf(settings: AgentSettings | null): string | undefined {
  const named = settings?.config?.model_secret_key;

  return typeof named === "string" ? named : undefined;
}
