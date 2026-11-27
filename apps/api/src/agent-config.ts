// What an agent definition's `config` may say to the subsystem, under the names the agent file specification gives them (website/src/content/docs/specs/agent-file.md, "2.2 Config"), which are lore's own. Anything else in `config` is kept and passed to nobody.
import { Refusal, type AgentSettings } from "@floor/store";
import type { BriefSettings, ExecutorSettings } from "@re-cinq/floor-contracts";
import { agentConfigSchema, type AgentConfig } from "@re-cinq/floor-pipeline/agent-config";
import { issuesOf } from "./parse.js";

/** The same settings under the names the floor's own wire uses. */
export function executorSettings(config: AgentConfig): ExecutorSettings {
  return {
    disallowedTools: config.disallowed_tools,
    skills: config.skills,
    skillsSource: config.skills_source,
    mcpServers: config.mcp_servers?.map(({ headers_secret: headersSecret, visit_token: visitToken, ...server }) => ({ ...server, headersSecret, visitToken })),
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
