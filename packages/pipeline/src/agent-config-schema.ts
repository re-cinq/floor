// The schema of an agent definition's `config`, under the names the agent file specification gives them (website/src/content/docs/specs/agent-file.md, "2.2 Config"), which are lore's own. Pure zod, so the browser can import it.
import { z } from "zod";

// A header or env var the server needs, valued from the key `ref` of the cluster's agent-secrets.
const secretRef = z.object({
  name: z.string().min(1).describe("The name of the header or environment variable."),
  ref: z.string().min(1).describe("The key in `agent-secrets`, the Kubernetes Secret in the agents' namespace, whose value it gets."),
});

const SCOPE = /^\S+$/;

// A token the floor signs for each visit, for a server that verifies it with the floor's published keys.
const visitToken = z.strictObject({
  audience: z.string().min(1).describe("Who the token is for: the name the server expects to be called by, which it checks."),
  scopes: z.array(z.string().regex(SCOPE, "a scope is one word, with no space in it")).describe("What the token may do at the server, in the server's own words."),
});

// One of the two ways to reach a server, never neither: a process the pod starts, or an address it calls.
const mcpServer = z
  .object({
    name: z.string().min(1).describe("The name the agent knows the server by."),
    transport: z.enum(["stdio", "http", "sse"]).describe("How the server is reached. `stdio` is a process the pod starts. `http` and `sse` are an address it calls."),
    command: z.string().min(1).describe("`stdio` only, and required there. The command that starts the server.").optional(),
    args: z.array(z.string()).describe("`stdio` only. The command's arguments.").optional(),
    url: z.url().describe("`http` and `sse` only, and required there. The server's address.").optional(),
    headers_secret: z.string().min(1).describe("The key in `agent-secrets`, the Kubernetes Secret in the agents' namespace, holding one whole header line, such as `Authorization: Bearer <token>`.").optional(),
    visit_token: visitToken.describe("`http` and `sse` only, and never beside `headers_secret`. The floor signs a token for each visit, naming the visit, its run and its repository, for the pod to present to the server as `Authorization: Bearer <token>`. The server verifies it with the keys the floor publishes at `/.well-known/jwks.json`.").optional(),
    headers: z.array(secretRef).describe("`http` and `sse` only. Headers sent to the server, each taking its value from a key in `agent-secrets`.").optional(),
    env: z.array(secretRef).describe("`stdio` only. Environment variables of the server's process, each taking its value from a key in `agent-secrets`.").optional(),
  })
  .refine((server) => (server.transport === "stdio" ? Boolean(server.command) : Boolean(server.url)), {
    message: "a stdio server needs a command, any other a url",
  })
  .refine((server) => !(server.visit_token && server.headers_secret), {
    message: "visit_token and headers_secret each set the server's authorization: give one",
  })
  .refine((server) => !(server.visit_token && server.transport === "stdio"), {
    message: "visit_token is for an http or sse server",
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
  skills_source: z.url().describe("The address the pod downloads the agent's skills from, usually the host's skills service. Without it the pod asks the floor, which has no skills to give.").optional(),
  mcp_servers: z.array(mcpServer).describe("The MCP servers the agent can call.").optional(),
  disallowed_tools: z.array(z.string()).describe("Tools the agent may not use.").optional(),
  env: z.record(z.string(), z.string()).describe("Environment variables of the agent, as plain values.").optional(),
  permission_mode: z.enum(["auto", "bypass"]).describe("`bypass` (the default) lets the agent run any tool without asking. `auto` keeps the CLI's own permission checks, so in the pod, where nobody can answer, an action that needs approval is refused.").optional(),
  max_turns: z.number().int().positive().describe("The most turns the agent takes in one visit.").optional(),
  model_secret_key: z.string().min(1).describe("Which key in `agent-secrets`, the Kubernetes Secret in the agents' namespace, holds the model's API key. Without it, the key the install sets for the model's family is used.").optional(),
  pod_resources: podResources.describe("The resources of the agent's container. With none, the cluster's default applies.").optional(),
});

export type AgentConfig = z.infer<typeof agentConfigSchema>;
