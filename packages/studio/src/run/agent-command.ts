// The argv that runs one agent station with the host's CLI, ported from agentcore's vendors/*/agent.d
import type { Vendor } from "./vendor.js";

export interface AgentCommandSettings {
  model?: string;
  maxTurns?: number;
  disallowedTools?: string[];
}

export interface AgentCommandInput {
  vendor: Vendor;
  settings: AgentCommandSettings;
  prompt: string;
  permission: "acceptEdits" | "bypass";
}

type PermissionFlags = Record<AgentCommandInput["permission"], string[]>;

const permissionFlags: PermissionFlags = {
  acceptEdits: ["--permission-mode", "acceptEdits"],
  bypass: ["--dangerously-skip-permissions"],
};

function claudeCommand({ settings, prompt, permission }: AgentCommandInput): string[] {
  const disallowedTools = settings.disallowedTools ?? [];
  const maxTurns = settings.maxTurns && settings.maxTurns > 0 ? String(settings.maxTurns) : undefined;

  return ["claude", "--print", "--verbose", "--output-format", "stream-json", ...optionalFlag("--model", settings.model), ...permissionFlags[permission], ...disallowedTools.flatMap((tool) => ["--disallowedTools", tool]), ...optionalFlag("--max-turns", maxTurns), "--", prompt];
}

function optionalFlag(flag: string, value: string | undefined): string[] {
  return value ? [flag, value] : [];
}

const codexPermissionFlags: PermissionFlags = {
  acceptEdits: [],
  bypass: ["--dangerously-bypass-approvals-and-sandbox"],
};

// Codex governs tools through its sandbox, as agentcore's codex/agent.d does, so it has no max-turns or disallowed-tools flags
function codexCommand({ settings, prompt, permission }: AgentCommandInput): string[] {
  return ["codex", "exec", "--json", ...optionalFlag("--model", settings.model), ...codexPermissionFlags[permission], "--", prompt];
}

const commandBuilders: Partial<Record<Vendor, (input: AgentCommandInput) => string[]>> = {
  claude: claudeCommand,
  codex: codexCommand,
};

export function agentCommand(input: AgentCommandInput): string[] {
  const build = commandBuilders[input.vendor];
  if (!build) throw new Error(`No agent command for vendor ${input.vendor}`);

  return build(input);
}
