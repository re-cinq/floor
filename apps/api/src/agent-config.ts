// What an agent definition's `config` may say to the subsystem, under the names docs/entities/agent-definition.md gives them, which are lore's own. Anything else in `config` is kept and passed to nobody.
import { z } from "zod";

// One of the two ways to reach a server, never neither: a process the pod starts, or an address it calls.
const mcpServer = z
  .object({
    name: z.string().min(1),
    transport: z.enum(["stdio", "http", "sse"]),
    command: z.string().min(1).optional(),
    args: z.array(z.string()).optional(),
    url: z.url().optional(),
    headers_secret: z.string().min(1).optional(),
  })
  .refine((server) => (server.transport === "stdio" ? Boolean(server.command) : Boolean(server.url)), {
    message: "a stdio server needs a command, any other a url",
  });

const KUBERNETES_QUANTITY = /^\d+(\.\d+)?(m|k|M|G|T|Ki|Mi|Gi|Ti)?$/;

const quantity = z.string().regex(KUBERNETES_QUANTITY, "a Kubernetes quantity such as 250m, 1, 512Mi or 2Gi");

const resourceQuantities = z.strictObject({ cpu: quantity.optional(), memory: quantity.optional(), "ephemeral-storage": quantity.optional() });

const podResources = z.strictObject({ requests: resourceQuantities.optional(), limits: resourceQuantities.optional() });

export const agentConfigSchema = z.looseObject({
  skills: z.array(z.string()).optional(),
  skills_source: z.url().optional(),
  mcp_servers: z.array(mcpServer).optional(),
  disallowed_tools: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
  permission_mode: z.enum(["auto", "bypass"]).optional(),
  max_turns: z.number().int().positive().optional(),
  model_secret_key: z.string().min(1).optional(),
  pod_resources: podResources.optional(),
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;

export interface ExecutorSettings {
  disallowedTools?: string[];
  skills?: string[];
  skillsSource?: string;
  mcpServers?: { name: string; transport: "stdio" | "http" | "sse"; command?: string; args?: string[]; url?: string; headersSecret?: string }[];
  env?: Record<string, string>;
  permissionMode?: "auto" | "bypass";
  maxTurns?: number;
  podResources?: AgentConfig["pod_resources"];
}

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
